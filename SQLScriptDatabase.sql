CREATE TABLE [cal].[Roles]
(
	[RoleID] INT NOT NULL PRIMARY KEY, 
  [Rolename] NCHAR(10) NOT NULL,
	[CreateEvent] BIT NOT NULL,
	[SelectEvent] BIT NOT NULL,
  [UpdateEvent] BIT NOT NULL, 
  [DeleteEvent] BIT NOT NULL, 
  [CreateProgressGroup] BIT NOT NULL, 
	[SelectProgressGroup] BIT NOT NULL,
  [UpdateProgressGroup] BIT NOT NULL, 
  [DeleteProgressGroup] BIT NOT NULL,
	[OpenSetting] BIT NOT NULL,
)
CREATE TABLE [cal].[Useres] (
    [UserID]    INT        NOT NULL,
    [Firstname] NCHAR (25) NULL,
    [Lastname]  NCHAR (25) NULL,
    [Role]      NCHAR (10) NOT NULL,
    [Verband]   NCHAR (3)  NOT NULL,
    PRIMARY KEY CLUSTERED ([UserID] ASC)
);
CREATE TABLE [cal].[Events] (
    [EventId]     INT            NOT NULL,
    [UserID]      INT            NOT NULL,
    [Titel]       NCHAR (200)    NOT NULL,
    [Time]        TIME (7)       NULL,
    [GroupID]     INT            NULL,
    [FlagID]      INT            NULL,
    [Section]     NCHAR (3)      NULL,
    [Description] NVARCHAR (MAX) NULL,
    [StartDate]   DATE           NOT NULL,
    [EndDate]     DATE           NULL,
    [UptDateTime] DATETIME       NOT NULL,
    [Status]      NCHAR (10)     NOT NULL,
    PRIMARY KEY CLUSTERED ([EventId] ASC)
);
CREATE TABLE [cal].[Flag] (
    [FlagId]      INT         NOT NULL,
    [Verband]     BIT         NOT NULL,
    [Bereich]     BIT         NOT NULL,
    [Name]        NCHAR (10)  NOT NULL,
    [Description] NCHAR (200) NULL,
    [Color]       NCHAR (7)   NOT NULL,
    PRIMARY KEY CLUSTERED ([FlagId] ASC)
);
CREATE TABLE [dbo].[ProgessGroup] (
    [ProgressGroupID] INT        NOT NULL,
    [Name]            NCHAR (30) NOT NULL,
    [Enabled]         BIT        NOT NULL,
    PRIMARY KEY CLUSTERED ([ProgressGroupID] ASC)
);
