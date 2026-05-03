## Summary

<!-- Brief description of the changes -->

## Test Plan

<!-- How was this tested? What MCP client did you verify with? -->

- [ ] `node build.js` succeeds
- [ ] MCP server starts without errors (`node bundle/index.js`)
- [ ] All affected tools return correct results
- [ ] No regression in existing tools (`node tests/full_regression_driver.js`)

## Checklist
- [ ] I have updated README.md if needed
- [ ] I have updated CHANGELOG.md if needed
- [ ] My changes do not break the public API of any MCP tool
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
