# Dvala Language Support for VS Code

Syntax highlighting for the [Dvala](https://github.com/mojir/dvala) programming language.

## Features

- **Syntax highlighting** for `.dvala` files based on the Dvala tokenizer
- **Color theme** ("Dvala Dark") that matches the playground's color scheme
- **Bracket matching** and auto-closing pairs
- **Comment toggling** (`//` line comments, `/* */` block comments)

## Color Mapping

| Token Type | Color | Hex |
|---|---|---|
| Keywords / Special Expressions | Bright Yellow | `#f0e68c` |
| Builtin Functions | Beige | `#dcdcaa` |
| Variables / Identifiers | Mint | `#4ec9b0` |
| Numbers | Viola | `#c586c0` |
| Strings / Regexp | Pink | `#cc8f77` |
| Comments | Gray | `#737373` |
| Operators / Brackets | Light Gray | `#d4d4d4` |

## Installation

### From source (development)

```bash
cd vscode-dvala
npm install -g @vscode/vsce   # if not installed
vsce package
code --install-extension dvala-0.1.0.vsix
```

### Symlink for development

```bash
ln -s "$(pwd)/vscode-dvala" ~/.vscode/extensions/dvala
```

Then reload VS Code.

## Supported Tokens

- **Special expressions**: `if`, `let`, `for`, `match`, `loop`, `block`, `doseq`, `unless`, `import`, `effect`, `perform`, `parallel`, `race`, `recur`, `defined?`
- **Reserved words**: `do`, `else`, `case`, `each`, `in`, `when`, `while`, `function`, `as`, `then`, `end`, `with`, `_`, `true`, `false`, `null`
- **Numeric constants**: `PI`, `E`, `PHI`, `NaN`, `∞`, `π`, `ε`, `φ`, etc.
- **Builtin functions**: `map`, `filter`, `reduce`, `sort`, `count`, `keys`, `vals`, etc.
- **Numbers**: decimal, hex (`0x`), octal (`0o`), binary (`0b`)
- **Strings**: double-quoted, triple-quoted doc strings
- **Regexp shorthand**: `#"pattern"gi`
- **Operators**: `->`, `|>`, `...`, `==`, `!=`, `&&`, `||`, `??`, `++`, etc.
- **Comments**: `//` line, `/* */` block, `#!` shebang
