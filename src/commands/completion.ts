/**
 * Completion Command
 * Shell 自動補全指令
 */

import { Command } from 'commander';

export const completionCommand = new Command('completion')
  .description('產生 Shell 自動補全腳本');

/**
 * tra completion bash
 */
completionCommand
  .command('bash')
  .description('產生 Bash 自動補全腳本')
  .action(() => {
    console.log(generateBashCompletion());
  });

/**
 * tra completion zsh
 */
completionCommand
  .command('zsh')
  .description('產生 Zsh 自動補全腳本')
  .action(() => {
    console.log(generateZshCompletion());
  });

/**
 * tra completion fish
 */
completionCommand
  .command('fish')
  .description('產生 Fish 自動補全腳本')
  .action(() => {
    console.log(generateFishCompletion());
  });

/**
 * 產生 Bash 補全腳本
 */
function generateBashCompletion(): string {
  return `# Bash completion for tra
# Add to ~/.bashrc: eval "$(tra completion bash)"

_tra_completions() {
    local cur prev words cword
    _init_completion || return

    local commands="stations timetable tpass fare live book lines cache config completion"
    local stations_cmds="list get search"
    local timetable_cmds="daily train station"
    local tpass_cmds="check regions stations"
    local live_cmds="train delays station"
    local lines_cmds="list get stations"
    local cache_cmds="status update clear"
    local config_cmds="init set get list path"
    local completion_cmds="bash zsh fish"

    case "\${COMP_CWORD}" in
        1)
            COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
            ;;
        2)
            case "\${prev}" in
                stations)
                    COMPREPLY=( $(compgen -W "\${stations_cmds}" -- "\${cur}") )
                    ;;
                timetable)
                    COMPREPLY=( $(compgen -W "\${timetable_cmds}" -- "\${cur}") )
                    ;;
                tpass)
                    COMPREPLY=( $(compgen -W "\${tpass_cmds}" -- "\${cur}") )
                    ;;
                live)
                    COMPREPLY=( $(compgen -W "\${live_cmds}" -- "\${cur}") )
                    ;;
                lines)
                    COMPREPLY=( $(compgen -W "\${lines_cmds}" -- "\${cur}") )
                    ;;
                cache)
                    COMPREPLY=( $(compgen -W "\${cache_cmds}" -- "\${cur}") )
                    ;;
                config)
                    COMPREPLY=( $(compgen -W "\${config_cmds}" -- "\${cur}") )
                    ;;
                completion)
                    COMPREPLY=( $(compgen -W "\${completion_cmds}" -- "\${cur}") )
                    ;;
            esac
            ;;
    esac

    return 0
}

complete -F _tra_completions tra
`;
}

/**
 * 產生 Zsh 補全腳本
 */
function generateZshCompletion(): string {
  return `#compdef tra

# Zsh completion for tra
# Add to ~/.zshrc: eval "$(tra completion zsh)"

_tra() {
    local -a commands
    commands=(
        'stations:車站查詢'
        'timetable:時刻表查詢'
        'tpass:TPASS 月票查詢'
        'fare:票價查詢'
        'live:即時資訊查詢'
        'book:生成訂票連結'
        'lines:路線查詢'
        'cache:快取管理'
        'config:設定管理'
        'completion:產生 Shell 補全腳本'
    )

    local -a stations_cmds
    stations_cmds=(
        'list:列出所有車站'
        'get:查詢車站'
        'search:模糊搜尋車站'
    )

    local -a timetable_cmds
    timetable_cmds=(
        'daily:查詢起訖站每日時刻表'
        'train:查詢車次時刻表'
        'station:查詢車站每日時刻表'
    )

    local -a tpass_cmds
    tpass_cmds=(
        'check:檢查 TPASS 適用性'
        'regions:列出所有生活圈'
        'stations:列出生活圈車站'
    )

    local -a live_cmds
    live_cmds=(
        'train:查詢車次即時位置'
        'delays:查詢列車延誤資訊'
        'station:查詢車站即時到離站'
    )

    local -a lines_cmds
    lines_cmds=(
        'list:列出所有路線'
        'get:查詢路線詳情'
        'stations:查詢路線車站'
    )

    local -a cache_cmds
    cache_cmds=(
        'status:顯示快取狀態'
        'update:更新快取資料'
        'clear:清除快取'
    )

    local -a config_cmds
    config_cmds=(
        'init:互動式初始化'
        'set:設定值'
        'get:取得值'
        'list:列出所有設定'
        'path:顯示設定檔路徑'
    )

    local -a completion_cmds
    completion_cmds=(
        'bash:產生 Bash 補全腳本'
        'zsh:產生 Zsh 補全腳本'
        'fish:產生 Fish 補全腳本'
    )

    _arguments -C \\
        '1: :->command' \\
        '2: :->subcommand' \\
        '*::arg:->args'

    case "$state" in
        command)
            _describe -t commands 'tra commands' commands
            ;;
        subcommand)
            case "$words[2]" in
                stations)
                    _describe -t commands 'stations commands' stations_cmds
                    ;;
                timetable)
                    _describe -t commands 'timetable commands' timetable_cmds
                    ;;
                tpass)
                    _describe -t commands 'tpass commands' tpass_cmds
                    ;;
                live)
                    _describe -t commands 'live commands' live_cmds
                    ;;
                lines)
                    _describe -t commands 'lines commands' lines_cmds
                    ;;
                cache)
                    _describe -t commands 'cache commands' cache_cmds
                    ;;
                config)
                    _describe -t commands 'config commands' config_cmds
                    ;;
                completion)
                    _describe -t commands 'completion commands' completion_cmds
                    ;;
            esac
            ;;
    esac
}

compdef _tra tra
`;
}

/**
 * 產生 Fish 補全腳本
 */
function generateFishCompletion(): string {
  return `# Fish completion for tra
# Add to ~/.config/fish/completions/tra.fish

# Disable file completion
complete -c tra -f

# Main commands
complete -c tra -n "__fish_use_subcommand" -a "stations" -d "車站查詢"
complete -c tra -n "__fish_use_subcommand" -a "timetable" -d "時刻表查詢"
complete -c tra -n "__fish_use_subcommand" -a "tpass" -d "TPASS 月票查詢"
complete -c tra -n "__fish_use_subcommand" -a "fare" -d "票價查詢"
complete -c tra -n "__fish_use_subcommand" -a "live" -d "即時資訊查詢"
complete -c tra -n "__fish_use_subcommand" -a "book" -d "生成訂票連結"
complete -c tra -n "__fish_use_subcommand" -a "lines" -d "路線查詢"
complete -c tra -n "__fish_use_subcommand" -a "cache" -d "快取管理"
complete -c tra -n "__fish_use_subcommand" -a "config" -d "設定管理"
complete -c tra -n "__fish_use_subcommand" -a "completion" -d "產生 Shell 補全腳本"

# stations subcommands
complete -c tra -n "__fish_seen_subcommand_from stations" -a "list" -d "列出所有車站"
complete -c tra -n "__fish_seen_subcommand_from stations" -a "get" -d "查詢車站"
complete -c tra -n "__fish_seen_subcommand_from stations" -a "search" -d "模糊搜尋車站"

# timetable subcommands
complete -c tra -n "__fish_seen_subcommand_from timetable" -a "daily" -d "查詢起訖站每日時刻表"
complete -c tra -n "__fish_seen_subcommand_from timetable" -a "train" -d "查詢車次時刻表"
complete -c tra -n "__fish_seen_subcommand_from timetable" -a "station" -d "查詢車站每日時刻表"

# tpass subcommands
complete -c tra -n "__fish_seen_subcommand_from tpass" -a "check" -d "檢查 TPASS 適用性"
complete -c tra -n "__fish_seen_subcommand_from tpass" -a "regions" -d "列出所有生活圈"
complete -c tra -n "__fish_seen_subcommand_from tpass" -a "stations" -d "列出生活圈車站"

# live subcommands
complete -c tra -n "__fish_seen_subcommand_from live" -a "train" -d "查詢車次即時位置"
complete -c tra -n "__fish_seen_subcommand_from live" -a "delays" -d "查詢列車延誤資訊"
complete -c tra -n "__fish_seen_subcommand_from live" -a "station" -d "查詢車站即時到離站"

# lines subcommands
complete -c tra -n "__fish_seen_subcommand_from lines" -a "list" -d "列出所有路線"
complete -c tra -n "__fish_seen_subcommand_from lines" -a "get" -d "查詢路線詳情"
complete -c tra -n "__fish_seen_subcommand_from lines" -a "stations" -d "查詢路線車站"

# cache subcommands
complete -c tra -n "__fish_seen_subcommand_from cache" -a "status" -d "顯示快取狀態"
complete -c tra -n "__fish_seen_subcommand_from cache" -a "update" -d "更新快取資料"
complete -c tra -n "__fish_seen_subcommand_from cache" -a "clear" -d "清除快取"

# config subcommands
complete -c tra -n "__fish_seen_subcommand_from config" -a "init" -d "互動式初始化"
complete -c tra -n "__fish_seen_subcommand_from config" -a "set" -d "設定值"
complete -c tra -n "__fish_seen_subcommand_from config" -a "get" -d "取得值"
complete -c tra -n "__fish_seen_subcommand_from config" -a "list" -d "列出所有設定"
complete -c tra -n "__fish_seen_subcommand_from config" -a "path" -d "顯示設定檔路徑"

# completion subcommands
complete -c tra -n "__fish_seen_subcommand_from completion" -a "bash" -d "產生 Bash 補全腳本"
complete -c tra -n "__fish_seen_subcommand_from completion" -a "zsh" -d "產生 Zsh 補全腳本"
complete -c tra -n "__fish_seen_subcommand_from completion" -a "fish" -d "產生 Fish 補全腳本"

# Global options
complete -c tra -s f -l format -d "輸出格式 (json/table)"
complete -c tra -s q -l quiet -d "安靜模式"
complete -c tra -s v -l verbose -d "詳細模式"
complete -c tra -s h -l help -d "顯示幫助"
complete -c tra -l version -d "顯示版本"
`;
}
