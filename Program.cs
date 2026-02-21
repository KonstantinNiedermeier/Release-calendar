using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.Sqlite;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("CalendarDb")
    ?? "Data Source=calendar.db";

builder.Services.AddSingleton(new Database(connectionString));

var app = builder.Build();

var db = app.Services.GetRequiredService<Database>();
db.Initialize();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/events", (Database database) => Results.Ok(database.GetEvents()));

app.MapPost("/api/events", (Database database, CalendarEvent payload) =>
{
    var created = database.CreateEvent(payload);
    return Results.Created($"/api/events/{created.Id}", created);
});

app.MapPut("/api/events/{id:long}", (Database database, long id, CalendarEvent payload) =>
{
    var updated = database.UpdateEvent(id, payload);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});

app.MapDelete("/api/events/{id:long}", (Database database, long id) =>
    database.DeleteEvent(id) ? Results.NoContent() : Results.NotFound());

app.MapGet("/api/groups", (Database database) => Results.Ok(database.GetGroups()));

app.MapPost("/api/groups", (Database database, CalendarGroup payload) =>
{
    if (string.IsNullOrWhiteSpace(payload.Name))
    {
        return Results.BadRequest("Gruppenname darf nicht leer sein.");
    }

    var created = database.CreateGroup(payload.Name.Trim());
    return Results.Created($"/api/groups/{created.Id}", created);
});

app.MapPut("/api/groups/{id:long}", (Database database, long id, CalendarGroup payload) =>
{
    if (string.IsNullOrWhiteSpace(payload.Name))
    {
        return Results.BadRequest("Gruppenname darf nicht leer sein.");
    }

    var updated = database.UpdateGroup(id, payload.Name.Trim(), payload.Closed);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});

app.MapPost("/api/groups/{id:long}/close", (Database database, long id) =>
{
    var updated = database.SetGroupClosed(id, true);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});

app.MapPost("/api/groups/{id:long}/reopen", (Database database, long id) =>
{
    var updated = database.SetGroupClosed(id, false);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});

app.MapDelete("/api/groups/{id:long}", (Database database, long id) =>
    database.DeleteGroup(id) ? Results.NoContent() : Results.NotFound());

app.MapGet("/api/users", (Database database) => Results.Ok(database.GetUsers()));

app.MapPost("/api/users/register", (Database database, UserRegisterRequest payload) =>
{
    if (string.IsNullOrWhiteSpace(payload.UserName) || string.IsNullOrWhiteSpace(payload.Password))
    {
        return Results.BadRequest("Benutzername und Passwort sind erforderlich.");
    }

    var created = database.CreateUser(payload.UserName.Trim(), payload.Password, payload.Role);
    return created is null
        ? Results.BadRequest("Benutzername existiert bereits.")
        : Results.Created($"/api/users/{created.Id}", created);
});

app.MapPost("/api/users/login", (Database database, UserLoginRequest payload) =>
{
    if (string.IsNullOrWhiteSpace(payload.UserName) || string.IsNullOrWhiteSpace(payload.Password))
    {
        return Results.BadRequest("Benutzername und Passwort sind erforderlich.");
    }

    var user = database.ValidateUser(payload.UserName.Trim(), payload.Password);
    return user is null ? Results.Unauthorized() : Results.Ok(user);
});

app.MapPut("/api/users/{id:long}", (Database database, long id, UserUpdateRequest payload) =>
{
    if (string.IsNullOrWhiteSpace(payload.UserName))
    {
        return Results.BadRequest("Benutzername ist erforderlich.");
    }

    var updated = database.UpdateUser(id, payload.UserName.Trim(), payload.Role, payload.IsActive);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});

app.MapDelete("/api/users/{id:long}", (Database database, long id) =>
    database.DeleteUser(id) ? Results.NoContent() : Results.NotFound());

app.Run();

public sealed record CalendarEvent(
    long Id,
    string Title,
    string StartDate,
    string? EndDate,
    string? Time,
    string Status,
    string? Description,
    long? GroupId,
    string? FlagId,
    string? TypeFlagId);

public sealed record CalendarGroup(long Id, string Name, bool Closed);

public sealed record AppUser(long Id, string UserName, string Role, bool IsActive, string CreatedAt);

public sealed record UserRegisterRequest(string UserName, string Password, string? Role);
public sealed record UserLoginRequest(string UserName, string Password);
public sealed record UserUpdateRequest(string UserName, string Role, bool IsActive);

public sealed class Database(string connectionString)
{
    public void Initialize()
    {
        using var connection = new SqliteConnection(connectionString);
        connection.Open();

        var pragma = connection.CreateCommand();
        pragma.CommandText = "PRAGMA foreign_keys = ON;";
        pragma.ExecuteNonQuery();

        var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS Groups (
                Id INTEGER PRIMARY KEY,
                Name TEXT NOT NULL,
                Closed INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS Events (
                Id INTEGER PRIMARY KEY,
                Title TEXT NOT NULL,
                StartDate TEXT NOT NULL,
                EndDate TEXT NULL,
                Time TEXT NULL,
                Status TEXT NOT NULL,
                Description TEXT NULL,
                GroupId INTEGER NULL,
                FlagId TEXT NULL,
                TypeFlagId TEXT NULL,
                FOREIGN KEY (GroupId) REFERENCES Groups(Id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS Users (
                Id INTEGER PRIMARY KEY,
                UserName TEXT NOT NULL UNIQUE,
                PasswordHash TEXT NOT NULL,
                Role TEXT NOT NULL,
                IsActive INTEGER NOT NULL DEFAULT 1,
                CreatedAt TEXT NOT NULL
            );
            """;
        command.ExecuteNonQuery();
    }

    public List<CalendarEvent> GetEvents()
    {
        using var connection = Open();
        var command = connection.CreateCommand();
        command.CommandText = "SELECT Id, Title, StartDate, EndDate, Time, Status, Description, GroupId, FlagId, TypeFlagId FROM Events ORDER BY StartDate, Id";

        var list = new List<CalendarEvent>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            list.Add(ReadEvent(reader));
        }

        return list;
    }

    public CalendarEvent CreateEvent(CalendarEvent payload)
    {
        using var connection = Open();
        var id = payload.Id > 0 ? payload.Id : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO Events (Id, Title, StartDate, EndDate, Time, Status, Description, GroupId, FlagId, TypeFlagId)
            VALUES (@id, @title, @startDate, @endDate, @time, @status, @description, @groupId, @flagId, @typeFlagId)
            """;
        FillEventParams(command, id, payload);
        command.ExecuteNonQuery();
        return payload with { Id = id };
    }

    public CalendarEvent? UpdateEvent(long id, CalendarEvent payload)
    {
        using var connection = Open();
        var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE Events
            SET Title = @title,
                StartDate = @startDate,
                EndDate = @endDate,
                Time = @time,
                Status = @status,
                Description = @description,
                GroupId = @groupId,
                FlagId = @flagId,
                TypeFlagId = @typeFlagId
            WHERE Id = @id
            """;
        FillEventParams(command, id, payload);

        return command.ExecuteNonQuery() == 0 ? null : payload with { Id = id };
    }

    public bool DeleteEvent(long id)
    {
        using var connection = Open();
        var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM Events WHERE Id = @id";
        command.Parameters.AddWithValue("@id", id);
        return command.ExecuteNonQuery() > 0;
    }

    public List<CalendarGroup> GetGroups()
    {
        using var connection = Open();
        var command = connection.CreateCommand();
        command.CommandText = "SELECT Id, Name, Closed FROM Groups ORDER BY Closed, Name";

        var list = new List<CalendarGroup>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            list.Add(new CalendarGroup(
                reader.GetInt64(0),
                reader.GetString(1),
                reader.GetInt64(2) == 1));
        }

        return list;
    }

    public CalendarGroup CreateGroup(string name)
    {
        using var connection = Open();
        var id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO Groups (Id, Name, Closed) VALUES (@id, @name, 0)";
        command.Parameters.AddWithValue("@id", id);
        command.Parameters.AddWithValue("@name", name);
        command.ExecuteNonQuery();
        return new CalendarGroup(id, name, false);
    }

    public CalendarGroup? UpdateGroup(long id, string name, bool closed)
    {
        using var connection = Open();
        var command = connection.CreateCommand();
        command.CommandText = "UPDATE Groups SET Name = @name, Closed = @closed WHERE Id = @id";
        command.Parameters.AddWithValue("@id", id);
        command.Parameters.AddWithValue("@name", name);
        command.Parameters.AddWithValue("@closed", closed ? 1 : 0);

        return command.ExecuteNonQuery() == 0 ? null : new CalendarGroup(id, name, closed);
    }

    public CalendarGroup? SetGroupClosed(long id, bool closed)
    {
        using var connection = Open();
        var command = connection.CreateCommand();
        command.CommandText = "UPDATE Groups SET Closed = @closed WHERE Id = @id";
        command.Parameters.AddWithValue("@id", id);
        command.Parameters.AddWithValue("@closed", closed ? 1 : 0);

        return command.ExecuteNonQuery() == 0 ? null : GetGroup(id);
    }

    public bool DeleteGroup(long id)
    {
        using var connection = Open();
        using var transaction = connection.BeginTransaction();

        var clearEvents = connection.CreateCommand();
        clearEvents.Transaction = transaction;
        clearEvents.CommandText = "UPDATE Events SET GroupId = NULL WHERE GroupId = @id";
        clearEvents.Parameters.AddWithValue("@id", id);
        clearEvents.ExecuteNonQuery();

        var deleteGroup = connection.CreateCommand();
        deleteGroup.Transaction = transaction;
        deleteGroup.CommandText = "DELETE FROM Groups WHERE Id = @id";
        deleteGroup.Parameters.AddWithValue("@id", id);
        var affected = deleteGroup.ExecuteNonQuery();

        transaction.Commit();
        return affected > 0;
    }

    public List<AppUser> GetUsers()
    {
        using var connection = Open();
        var command = connection.CreateCommand();
        command.CommandText = "SELECT Id, UserName, Role, IsActive, CreatedAt FROM Users ORDER BY UserName";

        var list = new List<AppUser>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            list.Add(ReadUser(reader));
        }

        return list;
    }

    public AppUser? CreateUser(string userName, string password, string? role)
    {
        using var connection = Open();
        var id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO Users (Id, UserName, PasswordHash, Role, IsActive, CreatedAt)
            VALUES (@id, @userName, @passwordHash, @role, 1, @createdAt)
            """;
        command.Parameters.AddWithValue("@id", id);
        command.Parameters.AddWithValue("@userName", userName);
        command.Parameters.AddWithValue("@passwordHash", HashPassword(password));
        command.Parameters.AddWithValue("@role", string.IsNullOrWhiteSpace(role) ? "user" : role!.Trim().ToLowerInvariant());
        command.Parameters.AddWithValue("@createdAt", DateTime.UtcNow.ToString("o"));

        try
        {
            command.ExecuteNonQuery();
            return GetUser(id);
        }
        catch (SqliteException)
        {
            return null;
        }
    }

    public AppUser? ValidateUser(string userName, string password)
    {
        using var connection = Open();
        var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, UserName, Role, IsActive, CreatedAt
            FROM Users
            WHERE UserName = @userName
              AND PasswordHash = @passwordHash
              AND IsActive = 1
            """;
        command.Parameters.AddWithValue("@userName", userName);
        command.Parameters.AddWithValue("@passwordHash", HashPassword(password));

        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadUser(reader) : null;
    }

    public AppUser? UpdateUser(long id, string userName, string role, bool isActive)
    {
        using var connection = Open();
        var command = connection.CreateCommand();
        command.CommandText = "UPDATE Users SET UserName = @userName, Role = @role, IsActive = @isActive WHERE Id = @id";
        command.Parameters.AddWithValue("@id", id);
        command.Parameters.AddWithValue("@userName", userName);
        command.Parameters.AddWithValue("@role", string.IsNullOrWhiteSpace(role) ? "user" : role.Trim().ToLowerInvariant());
        command.Parameters.AddWithValue("@isActive", isActive ? 1 : 0);

        return command.ExecuteNonQuery() == 0 ? null : GetUser(id);
    }

    public bool DeleteUser(long id)
    {
        using var connection = Open();
        var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM Users WHERE Id = @id";
        command.Parameters.AddWithValue("@id", id);
        return command.ExecuteNonQuery() > 0;
    }

    private CalendarGroup? GetGroup(long id)
    {
        using var connection = Open();
        var command = connection.CreateCommand();
        command.CommandText = "SELECT Id, Name, Closed FROM Groups WHERE Id = @id";
        command.Parameters.AddWithValue("@id", id);

        using var reader = command.ExecuteReader();
        if (!reader.Read()) return null;

        return new CalendarGroup(
            reader.GetInt64(0),
            reader.GetString(1),
            reader.GetInt64(2) == 1);
    }

    private AppUser? GetUser(long id)
    {
        using var connection = Open();
        var command = connection.CreateCommand();
        command.CommandText = "SELECT Id, UserName, Role, IsActive, CreatedAt FROM Users WHERE Id = @id";
        command.Parameters.AddWithValue("@id", id);

        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadUser(reader) : null;
    }

    private static AppUser ReadUser(SqliteDataReader reader)
    {
        return new AppUser(
            reader.GetInt64(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetInt64(3) == 1,
            reader.GetString(4));
    }

    private static CalendarEvent ReadEvent(SqliteDataReader reader)
    {
        return new CalendarEvent(
            reader.GetInt64(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.GetString(5),
            reader.IsDBNull(6) ? null : reader.GetString(6),
            reader.IsDBNull(7) ? null : reader.GetInt64(7),
            reader.IsDBNull(8) ? null : reader.GetString(8),
            reader.IsDBNull(9) ? null : reader.GetString(9));
    }

    private static void FillEventParams(SqliteCommand command, long id, CalendarEvent payload)
    {
        command.Parameters.AddWithValue("@id", id);
        command.Parameters.AddWithValue("@title", payload.Title);
        command.Parameters.AddWithValue("@startDate", payload.StartDate);
        command.Parameters.AddWithValue("@endDate", (object?)payload.EndDate ?? DBNull.Value);
        command.Parameters.AddWithValue("@time", (object?)payload.Time ?? DBNull.Value);
        command.Parameters.AddWithValue("@status", payload.Status);
        command.Parameters.AddWithValue("@description", (object?)payload.Description ?? DBNull.Value);
        command.Parameters.AddWithValue("@groupId", (object?)payload.GroupId ?? DBNull.Value);
        command.Parameters.AddWithValue("@flagId", (object?)payload.FlagId ?? DBNull.Value);
        command.Parameters.AddWithValue("@typeFlagId", (object?)payload.TypeFlagId ?? DBNull.Value);
    }

    private static string HashPassword(string password)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));
        return Convert.ToHexString(bytes);
    }

    private SqliteConnection Open()
    {
        var connection = new SqliteConnection(connectionString);
        connection.Open();

        var pragma = connection.CreateCommand();
        pragma.CommandText = "PRAGMA foreign_keys = ON;";
        pragma.ExecuteNonQuery();

        return connection;
    }
}
