using Microsoft.Data.SqlClient;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("CalendarDb")
    ?? "Server=localhost;Database=ReleaseCalendar;Trusted_Connection=True;TrustServerCertificate=True;";

builder.Services.AddSingleton(new Database(connectionString));

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/events", (Database database) => Results.Ok(database.GetEvents()));
app.MapPost("/api/events", (Database database, EventWriteRequest payload) => Results.Created("/api/events", database.CreateEvent(payload)));
app.MapPut("/api/events/{id:int}", (Database database, int id, EventWriteRequest payload) =>
{
    var updated = database.UpdateEvent(id, payload);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
app.MapDelete("/api/events/{id:int}", (Database database, int id) => database.DeleteEvent(id) ? Results.NoContent() : Results.NotFound());

app.MapGet("/api/groups", (Database database) => Results.Ok(database.GetGroups()));
app.MapPost("/api/groups", (Database database, CalendarGroup payload) => Results.Ok(database.CreateGroup(payload.Name)));
app.MapPut("/api/groups/{id:int}", (Database database, int id, CalendarGroup payload) =>
{
    var updated = database.UpdateGroup(id, payload.Name, !payload.Closed);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
app.MapPost("/api/groups/{id:int}/close", (Database database, int id) =>
{
    var updated = database.SetGroupEnabled(id, false);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
app.MapPost("/api/groups/{id:int}/reopen", (Database database, int id) =>
{
    var updated = database.SetGroupEnabled(id, true);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
app.MapDelete("/api/groups/{id:int}", (Database database, int id) => database.DeleteGroup(id) ? Results.NoContent() : Results.NotFound());

app.MapGet("/api/flags", (Database database) => Results.Ok(database.GetFlags()));
app.MapPost("/api/flags", (Database database, FlagItem payload) => Results.Ok(database.CreateFlag(payload)));
app.MapPut("/api/flags/{id:int}", (Database database, int id, FlagItem payload) =>
{
    var updated = database.UpdateFlag(id, payload);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
app.MapDelete("/api/flags/{id:int}", (Database database, int id) => database.DeleteFlag(id) ? Results.NoContent() : Results.NotFound());

app.MapGet("/api/roles", (Database database) => Results.Ok(database.GetRoles()));
app.MapGet("/api/admin/users", (Database database) => Results.Ok(database.GetAdminUsers()));
app.MapPost("/api/admin/users", (Database database, AdminUserWriteRequest payload) => Results.Ok(database.CreateAdminUser(payload)));
app.MapPut("/api/admin/users/{id:int}", (Database database, int id, AdminUserWriteRequest payload) =>
{
    var updated = database.UpdateAdminUser(id, payload);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
app.MapDelete("/api/admin/users/{id:int}", (Database database, int id) => database.DeleteAdminUser(id) ? Results.NoContent() : Results.NotFound());

// Legacy endpoints für bestehende UI
app.MapGet("/api/users", (Database database) => Results.Ok(database.GetLegacyUsers()));
app.MapPost("/api/users/register", (Database database, UserRegisterRequest payload) => Results.Ok(database.RegisterLegacyUser(payload)));
app.MapPost("/api/users/login", (Database database, UserLoginRequest payload) =>
{
    var user = database.LoginLegacyUser(payload.UserName);
    return user is null ? Results.Unauthorized() : Results.Ok(user);
});
app.MapPut("/api/users/{id:int}", (Database database, int id, UserUpdateRequest payload) =>
{
    var updated = database.UpdateLegacyUser(id, payload);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
app.MapDelete("/api/users/{id:int}", (Database database, int id) => database.DeleteAdminUser(id) ? Results.NoContent() : Results.NotFound());

app.Run();

public sealed record CalendarEvent(int Id, string Title, string StartDate, string? EndDate, string? Time, string Status, string? Description, int? GroupId, string? FlagId, string? TypeFlagId);
public sealed record EventWriteRequest(string Title, string StartDate, string? EndDate, string? Time, string Status, string? Description, int? GroupId, string? FlagId, string? TypeFlagId, int? UserId);
public sealed record CalendarGroup(int Id, string Name, bool Closed);
public sealed record FlagItem(int Id, bool Verband, bool Bereich, string Name, string? Description, string Color);
public sealed record RoleItem(int RoleId, string RoleName);
public sealed record AdminUser(int UserId, string? Firstname, string? Lastname, int RoleId, string Verband, string RoleName);
public sealed record AdminUserWriteRequest(string? Firstname, string? Lastname, int RoleId, string Verband);
public sealed record LegacyUser(int Id, string UserName, string Role, bool IsActive, string CreatedAt);
public sealed record UserRegisterRequest(string UserName, string Password, string? Role);
public sealed record UserLoginRequest(string UserName, string Password);
public sealed record UserUpdateRequest(string UserName, string Role, bool IsActive);

public sealed class Database(string connectionString)
{
    public List<CalendarEvent> GetEvents()
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT EventId, Titel, StartDate, EndDate, Time, Status, Description, GroupID, FlagID, Section FROM Events ORDER BY StartDate, EventId";
        using var reader = command.ExecuteReader();

        var list = new List<CalendarEvent>();
        while (reader.Read())
        {
            list.Add(new CalendarEvent(
                reader.GetInt32(0),
                reader.GetString(1).Trim(),
                reader.GetDateTime(2).ToString("yyyy-MM-dd"),
                reader.IsDBNull(3) ? null : reader.GetDateTime(3).ToString("yyyy-MM-dd"),
                reader.IsDBNull(4) ? null : reader.GetTimeSpan(4).ToString(@"hh\:mm"),
                reader.IsDBNull(5) ? "offen" : reader.GetString(5).Trim().ToLowerInvariant(),
                reader.IsDBNull(6) ? null : reader.GetString(6),
                reader.IsDBNull(7) ? null : reader.GetInt32(7),
                reader.IsDBNull(8) ? null : reader.GetInt32(8).ToString(),
                reader.IsDBNull(9) ? null : reader.GetString(9).Trim()));
        }

        return list;
    }

    public CalendarEvent CreateEvent(EventWriteRequest payload)
    {
        using var connection = Open();
        var id = NextId(connection, "Events", "EventId");
        using var command = connection.CreateCommand();
        command.CommandText = @"INSERT INTO Events (EventId, UserID, Titel, Time, GroupID, FlagID, Section, Description, StartDate, EndDate, UptDateTime, Status)
                                VALUES (@id, @userId, @title, @time, @groupId, @flagId, @section, @description, @startDate, @endDate, @uptDateTime, @status)";
        FillEvent(command, id, payload);
        command.ExecuteNonQuery();
        return GetEventById(id)!;
    }

    public CalendarEvent? UpdateEvent(int id, EventWriteRequest payload)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = @"UPDATE Events SET UserID=@userId, Titel=@title, Time=@time, GroupID=@groupId, FlagID=@flagId, Section=@section,
                                Description=@description, StartDate=@startDate, EndDate=@endDate, UptDateTime=@uptDateTime, Status=@status
                                WHERE EventId=@id";
        FillEvent(command, id, payload);
        return command.ExecuteNonQuery() == 0 ? null : GetEventById(id);
    }

    public bool DeleteEvent(int id)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM Events WHERE EventId=@id";
        command.Parameters.AddWithValue("@id", id);
        return command.ExecuteNonQuery() > 0;
    }

    public List<CalendarGroup> GetGroups()
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT ProgressGroupID, Name, Enabled FROM ProgessGroup ORDER BY Name";
        using var reader = command.ExecuteReader();
        var list = new List<CalendarGroup>();
        while (reader.Read())
        {
            var enabled = reader.GetBoolean(2);
            list.Add(new CalendarGroup(reader.GetInt32(0), reader.GetString(1).Trim(), !enabled));
        }
        return list;
    }

    public CalendarGroup CreateGroup(string name)
    {
        using var connection = Open();
        var id = NextId(connection, "ProgessGroup", "ProgressGroupID");
        using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO ProgessGroup (ProgressGroupID, Name, Enabled) VALUES (@id, @name, 1)";
        command.Parameters.AddWithValue("@id", id);
        command.Parameters.AddWithValue("@name", name);
        command.ExecuteNonQuery();
        return new CalendarGroup(id, name, false);
    }

    public CalendarGroup? UpdateGroup(int id, string name, bool enabled)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "UPDATE ProgessGroup SET Name=@name, Enabled=@enabled WHERE ProgressGroupID=@id";
        command.Parameters.AddWithValue("@id", id);
        command.Parameters.AddWithValue("@name", name);
        command.Parameters.AddWithValue("@enabled", enabled);
        return command.ExecuteNonQuery() == 0 ? null : new CalendarGroup(id, name, !enabled);
    }

    public CalendarGroup? SetGroupEnabled(int id, bool enabled)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "UPDATE ProgessGroup SET Enabled=@enabled WHERE ProgressGroupID=@id";
        command.Parameters.AddWithValue("@id", id);
        command.Parameters.AddWithValue("@enabled", enabled);
        return command.ExecuteNonQuery() == 0 ? null : GetGroups().FirstOrDefault(g => g.Id == id);
    }

    public bool DeleteGroup(int id)
    {
        using var connection = Open();
        using var tx = connection.BeginTransaction();

        using var clear = connection.CreateCommand();
        clear.Transaction = tx;
        clear.CommandText = "UPDATE Events SET GroupID = NULL WHERE GroupID = @id";
        clear.Parameters.AddWithValue("@id", id);
        clear.ExecuteNonQuery();

        using var del = connection.CreateCommand();
        del.Transaction = tx;
        del.CommandText = "DELETE FROM ProgessGroup WHERE ProgressGroupID = @id";
        del.Parameters.AddWithValue("@id", id);
        var affected = del.ExecuteNonQuery();
        tx.Commit();
        return affected > 0;
    }

    public List<FlagItem> GetFlags()
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT FlagId, Verband, Bereich, Name, Description, Color FROM Flag ORDER BY Name";
        using var reader = command.ExecuteReader();
        var list = new List<FlagItem>();
        while (reader.Read())
        {
            list.Add(new FlagItem(reader.GetInt32(0), reader.GetBoolean(1), reader.GetBoolean(2), reader.GetString(3).Trim(), reader.IsDBNull(4) ? null : reader.GetString(4).Trim(), reader.GetString(5).Trim()));
        }
        return list;
    }

    public FlagItem CreateFlag(FlagItem payload)
    {
        using var connection = Open();
        var id = payload.Id > 0 ? payload.Id : NextId(connection, "Flag", "FlagId");
        using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO Flag (FlagId, Verband, Bereich, Name, Description, Color) VALUES (@id,@verband,@bereich,@name,@description,@color)";
        FillFlag(command, id, payload);
        command.ExecuteNonQuery();
        return payload with { Id = id };
    }

    public FlagItem? UpdateFlag(int id, FlagItem payload)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "UPDATE Flag SET Verband=@verband, Bereich=@bereich, Name=@name, Description=@description, Color=@color WHERE FlagId=@id";
        FillFlag(command, id, payload);
        return command.ExecuteNonQuery() == 0 ? null : payload with { Id = id };
    }

    public bool DeleteFlag(int id)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "UPDATE Events SET FlagID = NULL WHERE FlagID = @id; DELETE FROM Flag WHERE FlagId=@id";
        command.Parameters.AddWithValue("@id", id);
        return command.ExecuteNonQuery() > 0;
    }

    public List<RoleItem> GetRoles()
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT RoleID, Rolename FROM Roles ORDER BY RoleID";
        using var reader = command.ExecuteReader();
        var roles = new List<RoleItem>();
        while (reader.Read()) roles.Add(new RoleItem(reader.GetInt32(0), reader.GetString(1).Trim()));
        return roles;
    }

    public List<AdminUser> GetAdminUsers()
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = @"SELECT u.UserID, u.Firstname, u.Lastname, u.RoleID, u.Verband, r.Rolename
                                FROM Useres u LEFT JOIN Roles r ON r.RoleID=u.RoleID ORDER BY u.UserID";
        using var reader = command.ExecuteReader();
        var list = new List<AdminUser>();
        while (reader.Read())
        {
            list.Add(new AdminUser(reader.GetInt32(0), reader.IsDBNull(1) ? null : reader.GetString(1).Trim(), reader.IsDBNull(2) ? null : reader.GetString(2).Trim(), reader.GetInt32(3), reader.GetString(4).Trim(), reader.IsDBNull(5) ? "" : reader.GetString(5).Trim()));
        }
        return list;
    }

    public AdminUser CreateAdminUser(AdminUserWriteRequest payload)
    {
        using var connection = Open();
        var id = NextId(connection, "Useres", "UserID");
        using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO Useres (UserID, Firstname, Lastname, RoleID, Verband) VALUES (@id,@first,@last,@role,@verband)";
        FillAdminUser(command, id, payload);
        command.ExecuteNonQuery();
        return GetAdminUsers().First(u => u.UserId == id);
    }

    public AdminUser? UpdateAdminUser(int id, AdminUserWriteRequest payload)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "UPDATE Useres SET Firstname=@first, Lastname=@last, RoleID=@role, Verband=@verband WHERE UserID=@id";
        FillAdminUser(command, id, payload);
        return command.ExecuteNonQuery() == 0 ? null : GetAdminUsers().FirstOrDefault(u => u.UserId == id);
    }

    public bool DeleteAdminUser(int id)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM Useres WHERE UserID=@id";
        command.Parameters.AddWithValue("@id", id);
        return command.ExecuteNonQuery() > 0;
    }

    public List<LegacyUser> GetLegacyUsers() =>
        GetAdminUsers().Select(u => new LegacyUser(u.UserId, $"{u.Firstname} {u.Lastname}".Trim(), u.RoleName, true, "-")).ToList();

    public LegacyUser RegisterLegacyUser(UserRegisterRequest payload)
    {
        var created = CreateAdminUser(new AdminUserWriteRequest(payload.UserName, string.Empty, RoleIdFromRoleName(payload.Role), "---"));
        return new LegacyUser(created.UserId, payload.UserName, created.RoleName, true, "-");
    }

    public LegacyUser? LoginLegacyUser(string userName) =>
        GetLegacyUsers().FirstOrDefault(u => string.Equals(u.UserName, userName, StringComparison.OrdinalIgnoreCase));

    public LegacyUser? UpdateLegacyUser(int id, UserUpdateRequest payload)
    {
        var updated = UpdateAdminUser(id, new AdminUserWriteRequest(payload.UserName, string.Empty, RoleIdFromRoleName(payload.Role), "---"));
        return updated is null ? null : new LegacyUser(updated.UserId, payload.UserName, updated.RoleName, payload.IsActive, "-");
    }

    private int RoleIdFromRoleName(string? role)
    {
        var roles = GetRoles();
        var selected = roles.FirstOrDefault(r => string.Equals(r.RoleName, role, StringComparison.OrdinalIgnoreCase));
        return selected?.RoleId ?? roles.FirstOrDefault().RoleId;
    }

    private CalendarEvent? GetEventById(int id)
    {
        return GetEvents().FirstOrDefault(e => e.Id == id);
    }

    private static void FillFlag(SqlCommand command, int id, FlagItem payload)
    {
        command.Parameters.AddWithValue("@id", id);
        command.Parameters.AddWithValue("@verband", payload.Verband);
        command.Parameters.AddWithValue("@bereich", payload.Bereich);
        command.Parameters.AddWithValue("@name", payload.Name);
        command.Parameters.AddWithValue("@description", (object?)payload.Description ?? DBNull.Value);
        command.Parameters.AddWithValue("@color", payload.Color);
    }

    private static void FillAdminUser(SqlCommand command, int id, AdminUserWriteRequest payload)
    {
        command.Parameters.AddWithValue("@id", id);
        command.Parameters.AddWithValue("@first", (object?)payload.Firstname ?? DBNull.Value);
        command.Parameters.AddWithValue("@last", (object?)payload.Lastname ?? DBNull.Value);
        command.Parameters.AddWithValue("@role", payload.RoleId);
        command.Parameters.AddWithValue("@verband", payload.Verband);
    }

    private static void FillEvent(SqlCommand command, int id, EventWriteRequest payload)
    {
        command.Parameters.AddWithValue("@id", id);
        command.Parameters.AddWithValue("@userId", payload.UserId ?? 0);
        command.Parameters.AddWithValue("@title", payload.Title);
        command.Parameters.AddWithValue("@time", string.IsNullOrWhiteSpace(payload.Time) ? DBNull.Value : TimeSpan.Parse(payload.Time));
        command.Parameters.AddWithValue("@groupId", (object?)payload.GroupId ?? DBNull.Value);
        command.Parameters.AddWithValue("@flagId", int.TryParse(payload.FlagId, out var flagId) ? flagId : DBNull.Value);
        command.Parameters.AddWithValue("@section", (object?)payload.TypeFlagId ?? DBNull.Value);
        command.Parameters.AddWithValue("@description", (object?)payload.Description ?? DBNull.Value);
        command.Parameters.AddWithValue("@startDate", DateTime.Parse(payload.StartDate));
        command.Parameters.AddWithValue("@endDate", string.IsNullOrWhiteSpace(payload.EndDate) ? DBNull.Value : DateTime.Parse(payload.EndDate));
        command.Parameters.AddWithValue("@uptDateTime", DateTime.Now);
        command.Parameters.AddWithValue("@status", payload.Status);
    }

    private static int NextId(SqlConnection connection, string table, string column)
    {
        using var command = connection.CreateCommand();
        command.CommandText = $"SELECT ISNULL(MAX({column}), 0) + 1 FROM {table}";
        return Convert.ToInt32(command.ExecuteScalar());
    }

    private SqlConnection Open()
    {
        var connection = new SqlConnection(connectionString);
        connection.Open();
        return connection;
    }
}
