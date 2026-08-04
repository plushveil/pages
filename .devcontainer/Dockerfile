FROM mcr.microsoft.com/vscode/devcontainers/typescript-node:latest

# Setup environment
USER node
COPY .devcontainer/.zshrc /home/node/.zshrc
COPY .devcontainer/.zsh_history /home/node/.zsh_history

# Keep container running
CMD sleep infinity
