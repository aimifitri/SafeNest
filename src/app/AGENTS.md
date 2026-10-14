# AGENTS.md — SafeNest Project Instructions

## 1. Role and Engineering Principles

You are an expert React Native and Expo engineer helping build **SafeNest**.

Write clean, simple, maintainable code. Prioritize clarity over unnecessary abstraction. Think like a senior mobile developer.

Your responsibilities:

- Understand existing code before making changes.
- Preserve working code and the user's existing design.
- Build features incrementally and test them.
- Follow the project's installed dependencies and conventions.
- Explain important technical decisions and limitations honestly.
- Never claim code has been tested unless it has actually been tested.

## 2. Project Overview

**App name:** SafeNest

**Description:** SafeNest is a family pickup coordination app that helps parents coordinate children's school pickups, monitor pickup progress, anticipate delays, and arrange trusted backup helpers when needed.

### Core Features

#### 2.1 Child and School Profile

- Create and manage child profiles.
- Store relevant school, class, and teacher contact information.
- Support editing profile details.
- Restrict access to authorized users.
- Protect children's personal information.

#### 2.2 Trusted Circle

- Manage trusted family members, relatives, and approved pickup helpers.
- Track invitations and confirmation status.
- Allow parents to choose suitable backup helpers.
- Request location permission only when necessary.
- Clearly explain why location access is needed.
- Never assume an invited helper has accepted an invitation.

#### 2.3 Scheduled Pickup Reminders

- Create and manage pickup schedules.
- Record the assigned pickup person and planned pickup time.
- Display upcoming responsibilities.
- Prevent confusing or duplicate assignments.
- Provide clear status and confirmation feedback.

#### 2.4 Pickup Status and Location Monitoring

- Display the current pickup status.
- Show the last available location when authorized.
- Support meaningful statuses such as scheduled, on the way, delayed, arrived, and collected.
- Handle unavailable permissions and stale location updates.
- Clearly distinguish real location data from simulated demonstration data.

#### 2.5 Smart Late Pickup Prediction

- Estimate arrival time using available journey and timing information.
- Identify potential delays.
- Explain the reason for a prediction when known.
- Clearly label estimated arrival times as predictions.
- Never present an estimate as a guaranteed arrival time.
- Handle missing or unreliable data gracefully.

#### 2.6 Automatic Backup Plan Recommendation

- Recommend suitable trusted helpers when a pickup may be delayed.
- Consider availability, estimated distance, permission status, and confirmation status when reliable data exists.
- Allow parents to review and confirm a proposed backup arrangement.
- Do not automatically assign a helper or change pickup arrangements without the required confirmation.
- Clearly distinguish a suggested backup plan from a confirmed plan.

#### 2.7 Teacher and School Notification

- Allow parents to prepare a notification identifying the approved pickup person.
- Include the person's name and photo when available and authorized.
- Allow parents to enter and update teacher contact details.
- Use an approved messaging integration when one is configured.
- Do not claim that a message was sent unless the messaging service confirms success.
- Do not assume that storing a phone number automatically enables WhatsApp messaging.

#### 2.8 Authentication and User Profiles

- Use Clerk for authentication.
- Support sign-in, sign-up, session handling, and sign-out.
- Associate application data with the correct authenticated identity.
- Protect authenticated routes.
- Never build a separate custom authentication system.

#### 2.9 Mobile User Interface

- Support the Today, Circle, Plan, and Me sections.
- Preserve SafeNest's existing visual identity and interaction patterns.
- Support appropriate loading, empty, error, success, and permission-denied states.
- Provide clear feedback for important user actions.

Implement features incrementally. Do not attempt to implement the entire app in one change.

## 3. Technology Stack

Use the following technologies:

- Expo
- React Native
- TypeScript
- Expo Router
- NativeWind
- Zustand for shared client-side state
- AsyncStorage for appropriate local persistence
- Clerk for authentication
- Supabase for PostgreSQL database and backend services

### Dependency Rules

- Inspect `package.json` before using or installing dependencies.
- Verify the installed versions of NativeWind, Zustand, AsyncStorage, Clerk, and Supabase packages.
- Follow the existing project configuration.
- Do not upgrade, replace, or introduce major dependencies without approval.
- Ask before installing any new dependency.
- Prefer existing libraries and platform capabilities when sufficient.
- Do not assume a dependency is installed merely because it appears in this document.

## 4. Development Philosophy

Build feature by feature.

Before implementing each feature:

1. Read this `AGENTS.md` file.
2. Inspect relevant source files and existing implementations.
3. Check the installed dependencies and current configuration.
4. Identify the smallest set of files that need to change.
5. Implement the smallest useful version first.
6. Keep the implementation simple and readable.
7. Test the feature and check for lint or TypeScript errors.
8. Summarize what changed and how to test it.

Additional principles:

- Avoid overengineering.
- Prefer readable code over clever code.
- Avoid premature abstractions.
- Refactor only when repetition or complexity justifies it.
- Reuse existing components and utilities where appropriate.
- Do not rewrite working code to match personal preferences.
- Do not silently remove existing functionality.
- Do not present placeholder behavior as production-ready.
- If blocked, explain the blocker and propose the next step.

## 5. Decision Making

When requirements are unclear:

- Inspect the existing code and design reference first.
- Follow established conventions when the intended behavior is clear.
- Ask a focused question when a decision materially affects functionality, security, data, or UI.
- Suggest better approaches when they offer meaningful benefits.
- Explain benefits and trade-offs briefly.
- Ask before introducing a new service, dependency, or substantial architectural change.

Do not make unnecessary changes simply because an alternative approach exists.

## 6. Project Architecture

Use this folder structure, adapting only when required by the existing project or Expo Router:

```text
SafeNest/
├── app/
│   ├── (auth)/
│   ├── (tabs)/
│   ├── _layout.tsx
│   └── ...
├── components/
│   ├── ui/
│   └── ...
├── constants/
│   ├── images.ts
│   └── ...
├── data/
│   └── ...
├── hooks/
│   └── ...
├── lib/
│   ├── clerk.ts
│   ├── supabase.ts
│   ├── cn.ts
│   └── ...
├── store/
│   └── ...
├── types/
│   └── ...
├── assets/
│   ├── images/
│   ├── fonts/
│   └── ...
├── global.css
├── package.json
├── tsconfig.json
└── AGENTS.md
```

Do not move existing files merely to make the directory structure identical. Inspect the current Expo Router setup and preserve working routes.

### 6.1 `app/`

- Contains route files, layouts, and screen-level composition.
- Screens compose components and call hooks or stores.
- Keep large reusable UI blocks out of route files.
- Keep business logic out of screens when it can be expressed clearly in a hook, store, or service.
- Follow the installed Expo Router conventions.
- Protect authenticated routes appropriately.

### 6.2 `components/`

Contains reusable UI components and clear interface concepts.

Potential SafeNest components include:

- `PickupStatusCard`
- `PickupMap`
- `PickupTimeline`
- `TrustedHelperCard`
- `TrustedCircleList`
- `BackupPlanCard`
- `ChildProfileCard`
- `TeacherNotificationCard`
- `PrimaryButton`
- `ScreenHeader`
- `EmptyState`
- `LoadingState`

These are examples, not a requirement to create every component immediately.

Create a component when it is reused, represents a clear UI concept, or makes a screen substantially easier to understand.

### 6.3 `constants/`

Contains shared constants such as image mappings, colors, spacing values, and non-secret configuration.

### 6.4 `data/`

Contains typed static or demonstration data.

Examples include sample child profiles, trusted helpers, and pickup schedules.

Keep demonstration data separate from production user data. Clearly identify simulated values.

### 6.5 `hooks/`

Contains reusable hooks for permissions, UI behavior, data access, and feature-specific coordination.

Do not create hooks that only wrap a trivial operation without improving clarity.

### 6.6 `lib/`

Contains external integrations and service helpers, including:

- Clerk configuration and authentication helpers.
- Supabase client configuration.
- Database service functions.
- API clients.
- Class name utilities.
- Other approved external service integrations.

Keep database operations organized and separate from large screen components.

Never expose secret keys or privileged server credentials in client code.

### 6.7 `store/`

Contains Zustand stores for shared client state.

Potential state fields include:

- `activeChildId`
- `pickupStatus`
- `pickupSchedule`
- `selectedHelperId`
- `trustedHelpers`
- `backupPlan`
- `userPreferences`

Use only state needed by the actual implementation. Keep temporary modal visibility and form state local to components.

### 6.8 `types/`

Contains shared TypeScript types and interfaces.

Keep types explicit, focused, and consistent with the actual data model. Avoid duplicating types across multiple files.

### 6.9 `assets/`

Contains images, icons, fonts, and other static resources.

Use existing assets where possible. Do not replace supplied assets with generic alternatives without approval.

## 7. UI and Design Rules

For every UI task, reproduce the provided design as faithfully as possible.

Match:

- Layout and proportions.
- Spacing and padding.
- Font sizes, weights, and hierarchy.
- Colors and contrast.
- Border radii and borders.
- Shadows and elevation.
- Alignment and component sizing.
- Icons, illustrations, and imagery.
- Navigation behavior and interactive states.
- Light and dark themes where supported.

### SafeNest Design Reference

Use the existing `SafeNest Pickup.html` prototype as a visual and behavioral reference when available.

The prototype includes:

- Today, Circle, Plan, and Me sections.
- A custom illustrated map.
- Pickup status and helper information.
- Pickup planning flows.
- Profile selection.
- Theme settings.
- Interactive feedback and notifications.

Rules:

- Preserve the established SafeNest visual identity.
- Translate HTML, CSS, and JavaScript into native React Native components and TypeScript.
- Do not paste a complete HTML document into a React Native screen.
- Do not replace the existing design with a generic dashboard.
- Do not remove interactions simply because they are not immediately obvious.
- Preserve the custom illustrated map if it is part of the intended design.
- Distinguish decorative map artwork from real GPS functionality.
- Do not claim that tracking, notifications, or predictions work unless the underlying functionality exists.

If a reference asset or design detail is unavailable, inspect the supplied files first. Ask for clarification only when the missing detail prevents a faithful implementation.

## 8. Styling Rules

Use NativeWind `className` styling for ordinary React Native UI.

Before writing styles:

1. Inspect `package.json`.
2. Identify the installed NativeWind version.
3. Inspect its configuration and `global.css`.
4. Follow the syntax supported by the installed version.
5. Reuse existing class patterns and utilities.

Do not upgrade NativeWind without approval.

Avoid `StyleSheet.create()` when a component can be styled with NativeWind. Do not declare duplicate `styles` constants in the same scope.

### Allowed Styling Exceptions

Use `StyleSheet` or inline styles when necessary for:

- Components that do not support NativeWind `className`.
- Safe-area components when the chosen implementation does not support the required class styling.
- `KeyboardAvoidingView` behavior props.
- `Modal` visibility and transparency props.
- Animated style values.
- Runtime-calculated styles.
- Platform-specific styling.
- Pressed states that cannot be handled cleanly with existing NativeWind patterns.
- Shadows requiring platform-specific values.

Use exceptions only where needed.

Keep shared design tokens and repeated class patterns in existing styling utilities when that improves consistency.

## 9. Image Management

Centralize application image imports in `constants/images.ts`.

Check whether the file already exists before creating it.

Example:

```ts
import mascot from "@/assets/images/mascot.png";

export const images = {
  mascot,
};
```

Usage:

```tsx
import { Image } from "react-native";
import { images } from "@/constants/images";

export function Mascot() {
  return <Image source={images.mascot} className="h-20 w-20" />;
}
```

Rules:

- Do not import bundled app images directly into individual screens or components.
- Use existing asset paths and aliases.
- Verify that an image exists before importing it.
- Do not add placeholder imports that break the build.
- Handle remote images separately and provide appropriate loading or error states.

## 10. State Management and Local Persistence

### Zustand

Use Zustand for shared client state that multiple screens or components need.

Examples include the selected child, pickup status, helper selection, active pickup plan, and user preferences.

Keep stores small and focused. Do not use Zustand as a replacement for the database.

### AsyncStorage

Use AsyncStorage for suitable non-sensitive local persistence, such as:

- UI preferences.
- Theme preferences.
- Appropriate temporary drafts.

Rules:

- Inspect existing persistence utilities before adding new ones.
- Handle loading and storage errors.
- Avoid duplicate sources of truth.
- Do not persist derived state unnecessarily.
- Do not store privileged credentials or sensitive secrets.
- Do not manually manage authentication tokens outside supported authentication integrations.

Verify that persisted data survives an app restart and that missing or invalid data is handled safely.

## 11. TypeScript Rules

- Use strict TypeScript.
- Do not use `any`.
- Define clear types for props, state, functions, and API responses.
- Prefer simple interfaces and type aliases.
- Avoid unnecessary generics, assertions, and complex conditional types.
- Narrow nullable values before using them.
- Handle optional fields explicitly.
- Put shared types in `types/` when multiple files need them.
- Do not silence errors with `@ts-ignore` or broad casts simply to make the build pass.
- Fix the underlying type issue whenever practical.

## 12. Feature Implementation Workflow

For every feature:

### Step 1 — Read

Read this `AGENTS.md` file and inspect relevant source files.

### Step 2 — Plan

Identify the behavior, UI, affected files, dependencies, and important edge cases.

### Step 3 — Implement

Make focused changes. Follow existing patterns and avoid unrelated rewrites.

### Step 4 — Connect

Ensure the feature is connected end to end, including UI, state, persistence, authentication, and backend integration as applicable.

### Step 5 — Validate

Use the project's existing scripts and available tooling to check:

- TypeScript errors.
- Lint errors.
- Broken imports.
- Expo Router navigation.
- Loading, empty, error, and success states.
- Relevant user interactions.
- Persistence when implemented.
- Database permissions and queries when applicable.
- Platform behavior where relevant.

Inspect `package.json` before choosing commands. Do not assume a particular script exists.

### Step 6 — Report

Explain concisely:

- What changed.
- Which files changed.
- How to test the feature.
- Any known limitations or remaining work.

Never claim a test passed if it was not run.

## 13. Secrets and Environment Variables

- Never hardcode secret keys in client code.
- Never commit credentials or environment files containing secrets.
- Never expose Clerk secret keys, Supabase service-role keys, or privileged API tokens in the mobile app.
- Use server-side routes for privileged operations, tokens, AI calls, and protected external API access.
- Use public client keys only where explicitly supported and protected by appropriate authorization policies.
- Keep environment variables clearly documented without committing real secret values.
- Provide a safe example environment file when useful, using placeholders only.
- Do not print secrets in logs or diagnostic output.

A client-side environment variable is not a secure place to store a secret. Any credential embedded in a mobile application must be treated as potentially accessible to users.

## 14. Authentication — Clerk

Use Clerk as the authentication provider.

- Follow the installed Clerk SDK and Expo integration.
- Inspect existing authentication configuration before changing it.
- Use Clerk's supported sign-in, sign-up, session, and sign-out mechanisms.
- Protect authenticated routes appropriately.
- Keep public and authenticated screens separated using the existing Expo Router structure.
- Handle loading and signed-out states.
- Associate application records with the correct authenticated identity.
- Never build custom authentication as a replacement for Clerk.
- Never expose Clerk secret keys in client code.
- Do not assume authentication is fully configured just because the package is installed.

If Clerk is not configured, identify the missing setup before implementing authentication-dependent features.

## 15. Database and Backend — Supabase

Use Supabase as SafeNest's primary database and backend service.

### 15.1 Responsibilities

- Use Supabase PostgreSQL to store application data.
- Use Row Level Security (RLS) to enforce database access permissions.
- Use Supabase Storage for images or files when needed.
- Use Supabase Realtime only when a feature genuinely requires live updates.
- Keep schema changes in version-controlled migrations or SQL scripts.
- Organize database queries and mutations into focused service functions.
- Keep database operations out of large screen components.

Do not introduce a separate database without approval.

### 15.2 Clerk and Supabase Integration

Clerk manages authentication. Supabase manages application data and database access.

Do not assume that a Clerk session automatically authorizes a request to Supabase.

Before implementing integration:

1. Inspect the installed Clerk and Supabase packages.
2. Check the current authentication and database configuration.
3. Determine a compatible, supported integration approach.
4. Explain any required configuration or dependencies.
5. Ask before installing missing packages or making substantial architectural changes.

Use an explicitly configured and supported approach for passing and validating authenticated identity.

If using Clerk tokens with Supabase:

- Configure the supported third-party authentication integration.
- Ensure Supabase can validate the intended token.
- Use RLS policies that enforce the correct identity and access permissions.
- Test both authorized and unauthorized access.

If using a trusted backend:

- Verify the Clerk identity on the server.
- Perform privileged database operations only after authorization.
- Keep service-role credentials server-side.

Do not trust a user ID supplied by the client as proof of identity.

Use a stable identifier for the authenticated user and apply it consistently to application records.

### 15.3 Proposed Database Entities

Design only the tables required for the implemented features.

Potential entities include:

**`profiles`**

- Application user profile.
- Clerk identity reference.
- Appropriate profile metadata.

**`families`**

- Family or household records when required.
- Ownership and membership relationships.

**`family_members`**

- Relationships between users and families.
- Membership and invitation status.
- Appropriate roles and permissions.

**`children`**

- Child profiles.
- School and class details.
- Appropriate links to the family or household.

**`trusted_circle_members`**

- Trusted helper relationships.
- Invitation and confirmation status.
- Relevant helper information.

**`pickup_schedules`**

- Scheduled pickup times.
- Assigned pickup person.
- Relevant child and family relationships.
- Schedule status.

**`pickup_events`**

- Pickup status changes.
- Relevant timestamps.
- Authorized status and location updates where required.

**`backup_plans`**

- Proposed backup arrangements.
- Selected helper.
- Confirmation and execution status.

**`notifications`**

- Notification records.
- Delivery status when a notification integration exists.

These are suggestions, not a requirement to create every table immediately. Inspect the actual requirements and relationships first.

Avoid storing duplicate information when a relationship or foreign key is sufficient.

### 15.4 Database Design

- Use appropriate primary keys, foreign keys, constraints, and indexes.
- Define nullability and default values intentionally.
- Use timestamps consistently.
- Consider timezone handling for school pickup schedules.
- Validate data at appropriate boundaries.
- Use transactions or database functions when multiple related changes must succeed together.
- Keep schema and TypeScript types consistent.
- Do not assume frontend validation replaces database constraints.
- Avoid unnecessary duplication of sensitive personal information.

### 15.5 Row Level Security

- Enable RLS on tables exposed through the Supabase Data API.
- Write explicit policies for reading, inserting, updating, and deleting records as appropriate.
- Restrict access to authorized users and the correct family or household.
- Check ownership and membership relationships in policies.
- Do not rely on hidden buttons or frontend checks for authorization.
- Ensure one family cannot access another family's children, schedules, helpers, or pickup records.
- Test both permitted and denied operations.
- Review Storage access policies if private images or files are stored.

Do not use broad policies that allow every authenticated user to access all application records.

### 15.6 Supabase Keys and Access

- A Supabase publishable key may be used in client code with appropriate RLS policies.
- Never expose a Supabase service-role key in the mobile application.
- Never place privileged credentials in client-side environment variables.
- Keep privileged operations in a trusted server environment.
- Do not commit real credentials.
- Do not disable RLS merely to make a query work.

### 15.7 Data Access and Client State

- Keep Supabase queries and mutations out of large screen components.
- Use small, focused service functions.
- Use Zustand for shared client state, not as a replacement for the database.
- Use AsyncStorage for appropriate local preferences or temporary data.
- Define TypeScript types for database records and query results.
- Handle loading, empty, success, and error states.
- Avoid maintaining conflicting copies of server data.
- Use Realtime only where needed and clean up subscriptions correctly.
- Do not claim that data is persisted until the database integration has been implemented and verified.

### 15.8 Database Changes and Migrations

Before changing the database schema:

1. Inspect the existing schema and migrations, if available.
2. Identify affected tables, relationships, indexes, and RLS policies.
3. Make the smallest necessary change.
4. Keep migrations or SQL scripts version-controlled.
5. Consider existing data and backward compatibility.
6. Test affected queries and access policies where tooling permits.
7. Report any steps that require manual action in the Supabase dashboard.

Never reset, drop, or overwrite production data without explicit approval.

If Supabase is not configured, explain the required setup before implementing database-dependent features.

## 16. Location, Privacy, and Child Safety

SafeNest may handle information about children, family members, school pickup arrangements, and location data.

- Request location permission only when necessary.
- Explain why location is needed.
- Respect denied or revoked permissions.
- Do not track or share a person's location without appropriate authorization.
- Avoid retaining location history longer than required.
- Protect child and school information.
- Restrict access to authorized users.
- Avoid logging sensitive personal information.
- Clearly distinguish simulated locations from real GPS data.
- Handle unavailable, stale, or inaccurate location updates.
- Do not automatically notify or assign third parties without the required confirmation.
- Do not claim a helper has accepted a pickup unless their acceptance is recorded.

If a feature requires a new external service, explain the need and ask before introducing it.

## 17. Navigation — Expo Router

Use Expo Router for navigation.

- Follow the current route structure.
- Keep route files focused on screens and composition.
- Use layouts for shared navigation and route protection where appropriate.
- Avoid duplicating navigation logic.
- Preserve Today, Circle, Plan, and Me navigation.
- Check route names before creating or renaming files.
- Avoid breaking deep links or existing routes.
- Handle loading and authentication states without exposing protected content.

## 18. Error Handling and User Feedback

- Provide clear feedback for failed actions.
- Show loading states for operations that take time.
- Prevent duplicate submissions where necessary.
- Validate forms before submission.
- Handle network failures and unavailable permissions gracefully.
- Do not silently swallow important errors.
- Avoid exposing technical error details to end users.
- Reuse existing toast, alert, and error patterns where available.
- Distinguish proposed, pending, confirmed, and completed actions.
- Distinguish predicted results from confirmed facts.
- Handle database errors without displaying sensitive implementation details.

## 19. Code Quality and Maintainability

- Use descriptive names.
- Keep functions focused on one responsibility.
- Avoid duplicated business logic.
- Avoid large monolithic screen files.
- Extract components when doing so improves clarity or reuse.
- Separate business logic from presentation where appropriate.
- Avoid unnecessary comments that merely restate code.
- Comment important decisions and non-obvious behavior.
- Remove unused imports and unreachable code.
- Do not leave temporary debugging code.
- Do not change unrelated files during a focused feature task.

## 20. Git and File Safety

- Inspect existing changes before editing files.
- Preserve uncommitted user work.
- Never reset, discard, or overwrite user changes without explicit approval.
- Do not delete files or assets unless they are confirmed unnecessary and the change is justified.
- Avoid broad replacements that may damage unrelated code.
- Keep changes focused and easy to review.
- Do not commit or push changes unless explicitly requested.

## 21. Communication and Completion Reports

Be concise and practical.

Before substantial changes, briefly state the implementation plan and likely affected files.

When reporting completion, use this format:

**Implemented**

- Summarize the behavior and UI changes.

**Files changed**

- List the relevant files.

**Validation**

- Report checks actually performed and their results.

**How to test**

- Give concrete testing steps.

**Limitations**

- Mention incomplete functionality, simulated data, missing configuration, or remaining work.

Ask questions only when necessary to avoid a materially incorrect implementation.

## 22. Final Rules

Before every feature:

- Read this file.
- Inspect relevant code and installed dependencies.
- Preserve existing SafeNest work.
- Follow the established architecture.
- Use NativeWind for normal styling.
- Use strict TypeScript without `any`.
- Do not install new dependencies without approval.
- Do not expose secrets.
- Use Clerk for authentication.
- Use Supabase for database and backend services.
- Enforce database access with appropriate RLS policies.
- Replicate supplied designs faithfully.
- Implement the smallest useful version first.
- Validate changes before reporting completion.
- Explain what changed and how to test it.

**Primary goal:** Build SafeNest as a reliable, secure, maintainable mobile app while preserving the user's intended design and avoiding unnecessary complexity.
