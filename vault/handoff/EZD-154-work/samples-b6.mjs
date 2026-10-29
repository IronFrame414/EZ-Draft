// Re-run 6 prototype check (Q-0418 (a)): node samples-b6.mjs <hook path>. Prints each sample whose result is not the expected one.
import { spawnSync } from 'node:child_process';
const hook = process.argv[2];
const deny = [
  // finding 1: ln as a word in every segment
  'true;ln -s ~/.claude x',
  'true&&ln -s ~/.claude x',
  'true|ln -s ~/.claude x',
  '(ln -s ~/.claude x)',
  'echo $(ln -s ~/.claude x)',
  'echo `ln -s ~/.claude x`',
  '\\ln -s ~/.claude x',
  '"ln" -s ~/.claude x',
  '"l"n -s ~/.claude x',
  "$'\\x6cn' -s ~/.claude x",
  'sudo ln -s ~/.claude x',
  'echo x | xargs ln -s ~/.claude',
  'sh -c "ln -s ~/.claude x"',
  "eval 'ln -s ~/.claude x'",
  'ln -s "$HOME/.claude" x',
  'ln -s ~/.cl* x',
  // finding 2: a level that could spell .claude
  'cat ~/.cl*/.c*',
  'cat ~/.cla[u]de/.c*',
  'cat ~/.claude{,}/.c*',
  'cat ~/.claud?/.c*',
  'cat ~/$(echo .claude)/.c*',
  'cat ~/`echo .claude`/.c*',
  'cat ~/.cl*/skills/../.c*',
  'cat ~/.cl*/$F',
  'cat ~/.CL*/.C*',
  // advisor round: shell pipes, `.` levels, spelled `..`, dot globbing, ${U:-ln}
  "echo 'ln -s ~/.claude x' | sh",
  "echo 'ln -s ~/.claude x' | bash",
  "echo 'ln -s ~/.claude x' | zsh",
  "echo 'ln -s ~/.claude x' | source /dev/stdin",
  'cat ~/.cl*/./.c*',
  'cat ~/.cl*/skills/.?/.c*',
  'cat ~/.cl*/skills/.{.,.}/.c*',
  'cat ~/.cl*/skills/`echo ..`/.c*',
  'setopt globdots; cat ~/*/.c*',
  'setopt GLOB_DOTS; cat ~/*/.c*',
  'shopt -s dotglob; cat ~/*/.c*',
  'GLOBIGNORE=x; cat ~/*/.c*',
  'cat ~/*/*(D)',
  'cat ~/*/*(#qD)',
  'cat ~/*/.c*(.D)',
  '${U:-ln} -s ~/.claude x',
  // second design: ANSI-C names, zsh groups, braces before the dot, a substitution holding a space
  "cat ~/$'\\x2e'claude/.c*",
  "cat ~/.claude/$'\\x2e'cred*",
  'cat ~/(.claude|x)/.c*',
  'cat ~/{.c,x}laude/.c*',
  'cat ~/.cl*/skills/$(echo ..)/.c*',
  'ln -s ~/.cla$X x',
  "bash <<'EOF'\ncat ~/.cl*/.c*\nEOF",
  "cat <<EOF\n$(cat ~/.cl*/.c*)\nEOF",
  "python3 - <<EOF\nx = `cat ~/.cl*/.c*`\nEOF",
];
const allow = [
  // finding 4: quoted text is not a command
  'git commit -m "ln may not name .claude"',
  'grep -rn "ln " .claude/hooks',
  // common commands the level check must not refuse
  'ls $DIR/*.md',
  'node $ROOT/scripts/x.mjs',
  'for f in $D/*; do echo $f; done',
  'ls ~/.cl*',
  'git -C .claude/worktrees/EZD-154 apply "$PWD/vault/handoff/x.patch"',
  'cat .claude/skills/*/SKILL.md',
  'grep -n kiln .claude/hooks/guard-bash.mjs',
  'ln -s app/src app/lnk',
  'grep -ln foo .claude/hooks/x.mjs',
  'ls -ln .claude',
  // real commands from earlier sessions (replay of the first design)
  "python3 - <<'EOF'\np='vault/plans/EZD-132.md'\ns=open(p).read()\nEOF",
  'for n in restore migcheck; do mkdir -p $EXP/$n/supabase/migrations; done',
  'cd /tmp/x && $PWD/../../../Users/josh/Projects/ezdraft/node_modules/.bin/supabase stop',
  "python3 - <<'EOF'\nx = '`a`/`b`'\nEOF",
  "python3 - <<'EOF'\ns = 'see `a`. Then source it; ln it to .claude/x'\nEOF\nnode x.mjs",
  `grep -rn -E "'(start|stop|db)'.*(--workdir|reset)" scripts`,
  // known limit (Q-0418 (a)): a path held in plain variables
  'ln -s $D x',
  'cat $D/.c*',
];
let bad = 0;
const check = (cmd, want) => {
  const r = spawnSync('node', [hook], { input: JSON.stringify({ tool_input: { command: cmd } }), encoding: 'utf8' });
  const denied = r.stdout.includes('"deny"');
  if (denied !== want) { bad++; console.log(`${want ? 'NOT DENIED' : 'DENIED'}: ${cmd}`); }
};
for (const c of deny) check(c, true);
for (const c of allow) check(c, false);
console.log(`deny ${deny.length}, allow ${allow.length}, wrong ${bad}`);
