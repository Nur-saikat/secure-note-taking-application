using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using MongoDB.Bson;
using MongoDB.Driver;
using NotesApi.Common;
using NotesApi.Configuration;
using NotesApi.Data;
using NotesApi.Services;

var builder = WebApplication.CreateBuilder(args);

var mongoOptions = builder.Configuration.GetSection(MongoDbOptions.SectionName).Get<MongoDbOptions>() ?? new();
mongoOptions.Validate();
builder.Services.Configure<MongoDbOptions>(builder.Configuration.GetSection(MongoDbOptions.SectionName));

var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new();
jwtOptions.Validate();
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.Configure<SeedAdminOptions>(builder.Configuration.GetSection(SeedAdminOptions.SectionName));

builder.Services.AddSingleton<IMongoDbContext, MongoDbContext>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<NoteService>();
builder.Services.AddScoped<PostService>();
builder.Services.AddScoped<InterestService>();

builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

builder.Services.AddCors(options => options.AddPolicy("frontend", policy =>
    policy.WithOrigins(
            "http://localhost:4200", "http://127.0.0.1:4200",
            "http://localhost:4300", "http://127.0.0.1:4300",
            "http://localhost:6543", "http://127.0.0.1:6543",
            "http://192.168.68.106:6543")
        .AllowAnyHeader()
        .AllowAnyMethod()));

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("auth", limiter =>
    {
        limiter.PermitLimit = 30;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
    });
});

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Key)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = SecurityHelpers.UsernameClaim,
            RoleClaimType = SecurityHelpers.RoleClaim
        };

        // Reject tokens whose account was deleted or whose role changed after the token was issued.
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var db = context.HttpContext.RequestServices.GetRequiredService<IMongoDbContext>();
                var userId = context.Principal?.FindFirstValue(JwtRegisteredClaimNames.Sub);
                var tokenRole = context.Principal?.FindFirstValue(SecurityHelpers.RoleClaim);

                if (string.IsNullOrWhiteSpace(userId) || !ObjectId.TryParse(userId, out _))
                {
                    context.Fail("Invalid token subject.");
                    return;
                }

                var user = await db.Users.Find(u => u.Id == userId)
                    .FirstOrDefaultAsync(context.HttpContext.RequestAborted);

                if (user is null || user.Role != tokenRole)
                {
                    context.Fail("Account is no longer valid.");
                }
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Secure Notes API",
        Version = "v1",
        Description = "REST API for the Secure Notes workspace: JWT authentication, private notes, "
            + "admin user and note management, the public post feed and the two aggregation scenarios."
    });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Paste the token returned by POST /api/auth/login or POST /api/auth/register."
    });

    options.OperationFilter<SwaggerAuthOperationFilter>();
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<IMongoDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    await MongoIndexes.EnsureAsync(db, logger);

    var seedOptions = app.Configuration.GetSection(SeedAdminOptions.SectionName).Get<SeedAdminOptions>() ?? new();
    await DbSeeder.SeedAdminAsync(db, seedOptions, logger);
}

app.UseExceptionHandler();
app.UseCors("frontend");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.DocumentTitle = "Secure Notes API";
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "Secure Notes API v1");
});

app.MapControllers();
app.Run();
