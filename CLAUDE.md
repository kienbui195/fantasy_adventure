## Prod chạy trên VPS, tài liệu nằm ngoài repo

- Code + test ở local; **không chạy bản prod ở laptop**. Deploy: `git push origin main` rồi `vps release hanhtrinhkyao` (giống can_goc_toa_do). Domain: https://hanhtrinhkyao.baodom.xyz, cổng host `127.0.0.1:47105`.
- Tài liệu phân tích, thiết kế, triển khai: `~/Documents/MyDocs/Games/fantasy-adventure/` (không lưu trong repo).
- Lệnh: `pnpm install`, `pnpm dev` (http://localhost:5173), `pnpm test`, `pnpm -r typecheck`, `pnpm build`.

## Agent skills

### Issue tracker

Issue được theo dõi bằng local markdown dưới `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Dùng 5 label mặc định (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: một `CONTEXT.md` + `docs/adr/` ở root. See `docs/agents/domain.md`.
