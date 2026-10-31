# jegprofil.info release requirements

- Prepare `web/dist` as the complete deployment package for each website release.
- Production builds must reproduce all required frontend files and release-specific
  PHP endpoints/helpers at their correct server-relative paths. Maintain the
  explicit allowlist in `web/deployment-files.js` when adding server components.
- Preserve existing Share Monitor backend files, hosting configuration, and other
  server components outside the release. Upload by merging the contents of dist;
  never use a deployment mode that deletes server files absent from the package.
- Keep incomplete pages' draft notices and publication safeguards. Dist being
  technically complete does not authorize publishing drafts or placeholders.
- Do not deploy, commit, push, run automated tests, or make unrelated changes
  unless explicitly authorized by the Captain for the current mission.
- At completion, report only whether `web/dist` is ready for upload, whether any
  additional files outside dist are required, and whether pages remain drafts or
  contain placeholders.
