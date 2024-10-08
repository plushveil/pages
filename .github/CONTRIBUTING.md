# Contributing to Pages

We welcome contributions to the Pages project! This guide will help you understand our workflow and how you can start contributing.

- [Unsure where to start?](#unsure-where-to-start)
- [GitHub Flow](#github-flow)
  - [Branch Naming](#branch-naming)
  - [Commit Messages](#commit-messages)
- [Code Style](#code-style)
- [License](#license)



## Unsure Where to Start?

If you're not sure how to proceed with your contribution or want to discuss a potential change, feel free to [open an issue](https://github.com/plushveil/pages/issues).
This is a great way to get feedback from the maintainers before you start working on something.



## GitHub Flow

We follow [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow) for all contributions. Here’s a quick overview of the process:

1. **Fork the repository**: Start by forking the project to your own GitHub account.

2. **Create a new branch**: All changes should happen in a new branch. Follow the [branch naming convention](#branch-naming) described below.

3. **Work on your feature or fix**: Commit your changes to the branch as you develop. Make sure to write clear commit messages explaining your changes.

4. **Push your branch**: Push your branch to your forked repository.

5. **Create a Pull Request (PR)**: When you're ready, open a pull request from your branch to the [`latest` branch in the pages repository](https://github.com/plushveil/pages/compare). In the PR description, explain what your changes do and reference any related issues.

6. **Review and merge**: After the pull request is reviewed, changes may be requested. Once everything is approved, your PR will be merged into the main codebase.


### Branch Naming

Use the following branch naming convention, which incorporates [semantic versioning](https://semver.org/):
- Format: `$username-$changelevel-$issue_number`
  - `$username`: Your GitHub username.
  - `$changelevel`: The significance of the change:
    - `patch` for small fixes or minor improvements.
    - `minor` for new features or updates that don’t break existing functionality.
    - `major` for breaking changes.
  - `$issue_number`: The GitHub issue number you're working on (if applicable).

For example, if your username is `johnDoe` and you're working on a minor feature related to issue #42, your branch should be named `johnDoe-minor-42`.

Here are some example branch names using the naming convention 

- `alexPatch-patch-101`: A small bug fix by the user "alexPatch" related to issue #101.
- `sarahDev-minor-67`: A new feature added by "sarahDev" for issue #67.
- `developerX-major-22`: A breaking change made by "developerX" for issue #22.


### Commit Messages

Please make sure your commit messages are descriptive and follow these guidelines:
- Use the present tense ("Add feature" not "Added feature").
- Keep messages concise but informative.
- Reference related issues or pull requests in your commit messages.



## Code Style

Please adhere to the project’s coding standards (e.g., formatting, indentation, etc.).
All JavaScript code should follow the [JavaScript Standard Style](https://github.com/neostandard/neostandard). If you're unsure, refer to the existing code for examples.

A great way to ensure your code is formatted correctly is to use the code formatter in this project. You can run the formatter with the following command:

```bash
npm run test:lint -- --fix
```


## License

By contributing, you agree that your contributions will be licensed under the project's [License](../LICENSE).
