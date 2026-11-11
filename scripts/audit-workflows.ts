import ts from "typescript";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type StateDeclaration = { project: string; file: string; line: number; name: string; values: string[] };
type Control = { project: string; file: string; line: number; hook: string; binding: string };
const root = fileURLToPath(new URL("../", import.meta.url));
const projects = [{ name: "web", root }, { name: "mobile", root: resolve(root, "../nognog-mobile") }];
const hooks = new Set(["useState", "useReducer", "useMutation", "useActionState"]);
const controls: Control[] = [];
const declarations: StateDeclaration[] = [];
const comparisons: { project: string; file: string; line: number; expression: string }[] = [];
let filesScanned = 0;
for (const project of projects) {
  if (!existsSync(project.root)) continue;
  const files = ts.sys.readDirectory(project.root, [".ts", ".tsx"], ["**/node_modules/**", "**/*.test.ts", "**/*.test.tsx"], ["src/**/*", "packages/domain/src/**/*"]);
  for (const file of files) {
    const text = ts.sys.readFile(file);
    if (!text) continue;
    filesScanned++;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const location = (node: ts.Node) => ({ project: project.name, file: relative(project.root, file).replaceAll("\\", "/"), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const hook = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
        if (hooks.has(hook)) {
          let parent: ts.Node | undefined = node.parent;
          while (parent && !ts.isVariableDeclaration(parent) && !ts.isFunctionLike(parent)) parent = parent.parent;
          controls.push({ ...location(node), hook, binding: parent && ts.isVariableDeclaration(parent) ? parent.name.getText(source) : "inline" });
        }
      }
      if ((ts.isTypeAliasDeclaration(node) && /Status$/.test(node.name.text)) || (ts.isPropertySignature(node) && /^(status|.*_status|.*_stage)$/.test(node.name.getText(source)))) {
        const type = node.type;
        if (type && ts.isUnionTypeNode(type)) {
          const values = type.types.flatMap(t => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal) ? [t.literal.text] : []);
          if (values.length) declarations.push({ ...location(node), name: node.name.getText(source), values });
        }
      }
      if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind)) {
        const expression = node.getText(source);
        if (/\b(status|stage|mode|state|intent)\b/.test(expression) && (ts.isStringLiteral(node.left) || ts.isStringLiteral(node.right))) comparisons.push({ ...location(node), expression });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}
const summary = { filesScanned, stateDeclarations: declarations.length, controls: controls.length, comparisons: comparisons.length };
const report = { scope: "Static TypeScript inventory of declared statuses, React control state, mutations and status comparisons. Command guards and allowed transitions must be checked in the SQL and workflow map; counts are not an authorization or exhaustive-path proof.", summary, declarations, controls, comparisons };
const output = process.argv[2];
if (output) {
  const target = resolve(output);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...summary, output: target }));
} else console.log(JSON.stringify(report, null, 2));
