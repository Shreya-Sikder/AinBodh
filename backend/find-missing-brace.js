const fs = require("fs");
const { execFileSync } = require("child_process");
const path = require("path");

const input = path.resolve("src/server.ts");
const testFile = path.resolve("src/server-auto-test.ts");
const esbuild = path.resolve(
  "node_modules/@esbuild/win32-x64/esbuild.exe"
);

const lines = fs.readFileSync(input, "utf8").split(/\r?\n/);

const candidates = [
  { char: "}", name: "}" },
  { char: ")", name: ")" },
  { char: "]", name: "]" },
];

console.log(`Checking ${lines.length} lines...`);
console.log("Testing missing }, ), and ]...");
console.log("");

for (const candidate of candidates) {
  console.log(`Trying missing ${candidate.char}...`);

  for (let i = 0; i < lines.length; i++) {
    const test = [
      ...lines.slice(0, i + 1),
      candidate.char,
      ...lines.slice(i + 1),
    ].join("\n");

    fs.writeFileSync(testFile, test, "utf8");

    try {
      execFileSync(
        esbuild,
        [
          testFile,
          "--loader:.ts=tsx",
          "--log-level=error",
          "--outfile=NUL",
        ],
        {
          stdio: "pipe",
          windowsHide: true,
        }
      );

      console.log("");
      console.log("========================================");
      console.log("FOUND THE FIX");
      console.log("========================================");
      console.log(`Missing character: ${candidate.char}`);
      console.log(`Insert it AFTER line ${i + 1}`);
      console.log("");
      console.log("Context:");

      const start = Math.max(0, i - 8);
      const end = Math.min(lines.length, i + 8);

      for (let j = start; j < end; j++) {
        if (j === i) {
          console.log(`${j + 1}: ${lines[j]}`);
          console.log(`>>> INSERT ${candidate.char} AFTER THIS LINE <<<`);
        } else {
          console.log(`${j + 1}: ${lines[j]}`);
        }
      }

      console.log("========================================");

      process.exit(0);
    } catch {
      // Keep searching.
    }
  }
}

console.log("");
console.log("========================================");
console.log("NO SINGLE BRACKET FIXED IT");
console.log("========================================");
console.log(
  "The syntax problem is probably a template literal/string or requires more than one character."
);
console.log("========================================");