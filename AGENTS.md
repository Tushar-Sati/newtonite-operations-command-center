<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- UI never imports mock data directly; all data goes through `src/lib/api/*` query options so a FastAPI backend can replace mocks (via `VITE_API_BASE_URL`) without touching components.
- Shared shell (sidebar/topbar) wraps `<Outlet />` in `__root.tsx`; reusable primitives live in `src/components/common`.
