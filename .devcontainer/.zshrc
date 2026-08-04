export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="devcontainers"
plugins=(git direnv)

source $ZSH/oh-my-zsh.sh
zstyle ':omz:update' mode disabled

eval "$(direnv hook zsh)"
