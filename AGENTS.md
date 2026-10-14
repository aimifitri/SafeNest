# SafeNest Project Instructions

## 1. Project purpose

SafeNest is a family pickup coordination app. Its frontend demonstrates pickup monitoring, trusted family members and helpers, pickup planning, late-pickup handling, backup arrangements, and school pickup verification. Treat the latest HTML file in `design_reference/` as the single source of truth for frontend design and prototype behavior.

## 2. Technology

- The project uses Expo, React Native, TypeScript, and Expo Router. Inspect `package.json` and the current setup before making assumptions.
- Inspect installed dependencies before suggesting libraries. Do not install packages or change configuration without team approval.
- Use the styling approach already present in the project unless the team agrees to change it.
- Follow the Expo and React Native documentation matching the installed versions when working with their APIs.

## 3. Prototype rules

- Before implementing a screen, read the latest HTML prototype in `design_reference/` and inspect the relevant existing code.
- Recreate its design and behavior as closely as practical using native mobile components: layout, colours, typography, cards, icons, navigation, and interactions.
- Treat the HTML, CSS, and JavaScript as a reference; do not paste them directly into React Native.
- Do not invent a different design or remove prototype features without approval.
- Preserve mobile usability, safe-area spacing, scrolling, accessibility, and dark/light theme behavior where applicable.

## 4. Frontend phase

- Focus on completing and integrating the frontend first. Use realistic mock data and local state for demonstrations.
- Do not connect Supabase, authentication, live location, real notifications, or external services yet.
- Clearly label simulated functionality in the UI or relevant code so it cannot be mistaken for a production integration.

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
- Report modified files, checks performed and their results, known issues, and any simulated behavior. Never claim a check was run if it was not.

## 9. Required workflow

1. Read these instructions before coding.
2. Inspect the relevant code, dependencies, and latest prototype.
3. State the intended files to modify.
4. Implement one assigned feature at a time, coordinating shared work as needed.
5. Test the changes and report the outcome before declaring the task complete.
