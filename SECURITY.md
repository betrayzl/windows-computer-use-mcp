# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| 1.0.x   | :x:                |

## Reporting a Vulnerability

Please report security vulnerabilities via **GitHub Security Advisories**:
https://github.com/betrayzl/windows-computer-use-mcp/security/advisories/new

**Do NOT open a public issue for security vulnerabilities.**

We aim to respond within 72 hours and publish fixes as soon as possible.

## Security Considerations

This project provides deep Windows system access (input simulation, screen
capture, process enumeration, window management). Users should:

1. **Trusted environment only**: Only run this MCP server on machines you fully control
2. **No network exposure**: The MCP stdio transport is local-only by design — never expose it over a network without authentication and encryption
3. **Review permissions**: Audit which tools your AI agent is allowed to call before connecting
4. **Principle of least privilege**: Run with the minimum Windows user privileges needed for your use case
