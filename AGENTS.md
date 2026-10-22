# SafeNest Project Instructions

## 1. Project purpose

SafeNest is a family pickup coordination app. Its frontend supports pickup monitoring, trusted family members and helpers, pickup planning, late-pickup handling, backup arrangements, and school pickup verification. The current implemented app design and approved improvements are the design baseline. Files in `design_reference/` provide historical context and ideas; they are not a strict specification.

## 2. Technology

- The project uses Expo, React Native, TypeScript, and Expo Router. Inspect `package.json` and the current setup before making assumptions.
- Inspect installed dependencies before suggesting libraries. Do not install packages or change configuration without team approval.
- Use the styling approach already present in the project unless the team agrees to change it.
- Follow the Expo and React Native documentation matching the installed versions when working with their APIs.

## 3. Design and prototype guidance

- Before changing a screen, inspect its current implementation and the surrounding app so existing design improvements and conventions are preserved.
- Use the current app design and approved improvements as the baseline. Consult `design_reference/` when it helps clarify product intent or a missing behavior, but do not copy it strictly or undo later improvements to match it.
- Treat prototype HTML, CSS, and JavaScript as reference material; do not paste them directly into React Native.
- Keep visual and interaction changes consistent with the current app. Do not introduce a substantially different design or remove useful behavior without coordination.
- Preserve mobile usability, safe-area spacing, scrolling, accessibility, and dark/light theme behavior where applicable.

## 4. Frontend and backend boundaries

- The current app already includes Supabase authentication, profiles, household data, pickup journeys, and selected Trusted Circle operations. Preserve working integrations and inspect their APIs before changing them.
- Some behavior remains simulated or depends on backend work that has not been approved or applied. Clearly label simulated behavior in the UI and code so it cannot be mistaken for a production integration.
- Do not assume that invitation approval, pickup permissions, broadcast requests, or every backend API is ready. Confirm the specific feature and its backend status before connecting UI to it.
- Do not change Trusted Circle database functions, add or apply migrations, or run `supabase db push` or `supabase db reset` without explicit coordination with the project owner. Never apply changes to the shared database as part of local frontend work.
- Do not add new external services, authentication flows, location sharing, or notifications without team approval. Treat the public Supabase anon/publishable key as client-visible; never put a service-role or other secret key in app code or an `EXPO_PUBLIC_` variable.

## 5. Existing project structure

- Preserve existing Expo Router routes and working code. Current routes are `src/app/_layout.tsx`, `src/app/index.tsx`, `src/app/circle.tsx`, `src/app/plan.tsx`, and `src/app/settings.tsx`.
- Inspect the actual code before making assumptions; route files currently compose screen components from `src/components/`.
- Keep screen-specific components separate from reusable shared components. Follow the existing structure and conventions rather than relocating files to fit a proposed layout.

## 6. Team ownership

- Member 1 owns Today and its screen-specific components.
- Member 2 owns Circle and its screen-specific components.
- Member 3 owns Plan and its screen-specific components.
- Member 4 owns Settings/profile and its screen-specific components.
- Member 5 coordinates navigation, shared components, design consistency, and integration.
- Avoid editing another member's assigned files without coordination. Coordinate before changing shared files, shared types, or dependencies.

## 7. Coding standards

- Use TypeScript and avoid `any`. Prefer small, reusable components and clear names.
- Follow existing project conventions and styling. Do not rewrite the app to implement one feature.
- Do not silently overwrite another member's work or introduce unnecessary dependencies.
- Keep changes focused and preserve existing functionality.
- Treat child, school, family, and location information as sensitive. Do not expose credentials or secrets in client code or logs.

## 8. Testing and completion

- Check the relevant screen in Expo Go and test navigation, interactions, scrolling, and existing functionality.
- Run the available TypeScript check (`npx tsc --noEmit`) before declaring work complete. Run other project checks when appropriate and available.
- Keep tests and verification proportionate to the task. Do not claim checks were run unless they were.
- Report modified files, checks performed and their results, known issues, and any simulated behavior. Never claim a check was run if it was not.

## 9. Required workflow

1. Read these instructions before coding.
2. Inspect the relevant code and dependencies; consult `design_reference/` when it is useful context.
3. State the intended files to modify.
4. Implement one assigned feature at a time, coordinating shared work as needed.
5. Test the changes and report the outcome before declaring the task complete.
