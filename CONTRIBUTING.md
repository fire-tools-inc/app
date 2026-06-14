# Contributing to Fire Tools

Thank you for your interest in contributing to Fire Tools! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Communication](#communication)

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 20.19.0 or higher (or 22.12.0+, or 24.0.0+)
- **npm**: Comes with Node.js
- **Git**: For version control

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub by clicking the "Fork" button

2. **Clone your fork** to your local machine:
   ```bash
   git clone https://github.com/YOUR-USERNAME/app.git
   cd app
   ```

3. **Add the upstream repository**:
   ```bash
   git remote add upstream https://github.com/fire-tools-inc/app.git
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Start the development server**:
   ```bash
   npm run dev
   ```

6. Open your browser to the URL shown in the terminal (typically http://localhost:5173)

## Development Workflow

### Creating a Branch

Always create a new branch for your changes:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

Branch naming conventions:
- `feature/` - For new features
- `fix/` - For bug fixes
- `docs/` - For documentation changes
- `refactor/` - For code refactoring
- `test/` - For adding or updating tests

### Making Changes

1. **Make your changes** in your feature branch
2. **Test your changes** thoroughly:
   ```bash
   npm test
   npm run build
   ```
3. **Run the development server** and manually test the UI
4. **Keep changes focused** - one feature or fix per pull request

### Committing Your Changes

Write clear, descriptive commit messages:

```bash
git add .
git commit -m "Add feature: description of what you added"
```

Good commit message examples:
- `Fix: Correct calculation error in Monte Carlo simulation`
- `Feature: Add export to Excel functionality`
- `Docs: Update README with new installation instructions`
- `Refactor: Simplify asset allocation calculation logic`

### Keeping Your Fork Updated

Regularly sync your fork with the upstream repository:

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

## Code Standards

### TypeScript

- **Use strict TypeScript** - All code must pass TypeScript compilation without errors
- **Avoid `any`** - Use specific types or `unknown` instead
- **Export types** - Make types available for other modules when needed
- **No unused variables** - Remove unused imports and variables

### React Components

- **Functional components only** - Use React hooks, no class components
- **TypeScript for props** - Define interfaces for component props
- **Destructure props** - Extract props in function parameters
- **Accessibility** - Use semantic HTML and ARIA attributes
- **Performance** - Use `React.memo`, `useMemo`, and `useCallback` judiciously

### Styling

- **CSS files** - Use component-specific CSS files (e.g., `HomePage.css`)
- **CSS variables** - Use existing CSS variables for colors and spacing
- **Responsive design** - Test on different screen sizes
- **Accessibility** - Ensure sufficient color contrast (WCAG AA: 4.5:1)

### Code Quality

- **No console.log** - Remove debug logs before committing (except `console.error`)
- **Error handling** - Catch errors and display meaningful messages to users
- **Comments** - Add comments only when necessary to explain complex logic
- **Documentation** - Update README.md and relevant docs for user-facing changes

### Testing

- **Write tests** - Add tests for new features and bug fixes
- **Test coverage** - Aim for high coverage on utility functions and business logic
- **Run tests** - Ensure all tests pass before submitting PR:
  ```bash
  npm test
  ```

### Linting & Building

Before submitting a PR, ensure:

```bash
# Build passes
npm run build

# Tests pass
npm test
```

## Pull Request Process

### Before Submitting

1. ✅ Code follows the style guidelines
2. ✅ All tests pass
3. ✅ Code builds without errors
4. ✅ Changes have been manually tested
5. ✅ Documentation is updated (if needed)
6. ✅ Commit messages are clear and descriptive
7. ✅ Branch is up to date with `main`

### Submitting a Pull Request

1. **Push your branch** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request** on GitHub:
   - Go to the original repository
   - Click "New Pull Request"
   - Select your fork and branch
   - Fill out the PR template

3. **Write a clear PR description** including:
   - What changes were made
   - Why the changes were necessary
   - How to test the changes
   - Screenshots (for UI changes)
   - Related issue numbers (e.g., "Fixes #123")

### PR Review Process

- A maintainer will review your PR
- Address any requested changes
- Once approved, a maintainer will merge your PR
- Your contribution will be included in the next release

### PR Guidelines

- **Keep PRs focused** - One feature or fix per PR
- **Small PRs are better** - Easier to review and merge
- **Write tests** - Include tests for new functionality
- **Update docs** - Keep documentation in sync with code
- **Respond promptly** - Address review feedback in a timely manner

## Issue Guidelines

We use GitHub Issue Templates to help you report bugs and request features. This ensures we have all the information needed to help you.

### Quick Links

- 🐛 **[Report a Bug](https://github.com/fire-tools-inc/app/issues/new?template=bug_report.yml)** - Something isn't working correctly
- ✨ **[Request a Feature](https://github.com/fire-tools-inc/app/issues/new?template=feature_request.yml)** - Suggest a new feature or improvement
- 🎨 **[UX/UI Suggestion](https://github.com/fire-tools-inc/app/issues/new?template=ux_ui_suggestion.yml)** - Improve the user experience or interface
- 🔒 **[Security Issue](https://github.com/fire-tools-inc/app/security/advisories/new)** - Report security vulnerabilities privately

You can also report bugs directly from the app via **Settings → Support & Feedback → Report a Bug**.

### Reporting Bugs

When reporting a bug, include:

1. **Clear title** - Summarize the issue
2. **Bug category** - UI bug, UX bug, calculation bug, etc.
3. **Description** - Detailed explanation of the bug
4. **Steps to reproduce** - Exact steps to recreate the issue
5. **Expected behavior** - What should happen
6. **Actual behavior** - What actually happens
7. **Environment** - Browser, OS, Node.js version
8. **Screenshots** - If applicable

### Requesting Features

When requesting a feature, include:

1. **Clear title** - Summarize the feature
2. **Feature category** - Which area of the app does it relate to?
3. **Use case** - Why is this feature needed?
4. **Proposed solution** - How should it work?
5. **Alternatives** - Other solutions you've considered
6. **Additional context** - Any other relevant information

### Issue Labels

Issues are organized with labels:

- `bug` - Something isn't working
- `enhancement` - New feature or request
- `ux/ui` - User experience or interface improvements
- `documentation` - Documentation improvements
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed

## Communication

### Where to Ask Questions

- **GitHub Issues** - For bug reports and feature requests (primary support channel)
- **GitHub Discussions** - For general questions and discussions (if enabled)
- **Pull Request comments** - For questions about specific code changes

### Response Times

- **Bug reports** - We aim to respond within 3-5 business days
- **Feature requests** - We aim to respond within 1-2 weeks
- **Pull requests** - We aim to review within 1 week

### Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to security@mb-consulting.dev.

## Releasing

Releases are fully automated via GitHub Actions. To create a new release, use
the one-tap release script:

```bash
./scripts/release.sh
```

Need to bump first? Use:

```bash
./scripts/release.sh --bump          # next minor
./scripts/release.sh --bump 2.1.3    # explicit version
```

`scripts/release.sh` prevents tag/version mismatches by enforcing that
`package.json` and the generated tag stay aligned before the tag is pushed.

Pushing the tag triggers the **Release** workflow (`.github/workflows/release.yml`), which:

1. **Verifies** the tag's semver core matches the `version` field in `package.json`.
2. **Builds** macOS DMGs (arm64 + x64) and a Windows NSIS installer.
3. **Publishes** a GitHub Release with auto-generated release notes and all build artifacts attached.

> **Important:** The tag version and `package.json` version must match, otherwise the workflow will fail at the verification step.

## Additional Resources

- [README.md](README.md) - Project overview and usage
- [AGENTS.md](AGENTS.md) - Technical architecture and AI agent instructions
- [SECURITY.md](SECURITY.md) - Security policy and vulnerability reporting
- [LICENSE](LICENSE) - Project license (MIT)

## Recognition

Contributors are recognized in several ways:

- Listed in the repository's contributors page
- Mentioned in release notes for significant contributions
- Community recognition and gratitude

Thank you for contributing to Fire Tools! Your efforts help make financial independence planning accessible to everyone.
