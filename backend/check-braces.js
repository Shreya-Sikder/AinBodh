const fs = require("fs");

const s = fs.readFileSync("src/server.ts", "utf8");

const stack = [];

let line = 1;
let col = 0;
let state = "code";
let quote = "";

for (let i = 0; i < s.length; i++) {
  const c = s[i];
  const n = s[i + 1];

  if (state === "code") {
    if (c === "/" && n === "/") {
      state = "line";
      i++;
      col++;
      continue;
    }

    if (c === "/" && n === "*") {
      state = "block";
      i++;
      col++;
      continue;
    }

    if (c === '"' || c === "'") {
      state = "string";
      quote = c;
    } else if (c === "`") {
      state = "template";
    } else if (c === "{") {
      stack.push({
        type: "{",
        line,
        col: col + 1,
      });
    } else if (c === "}") {
      if (stack.length === 0) {
        console.log(
          `EXTRA } at line ${line}, column ${col + 1}`
        );
      } else {
        stack.pop();
      }
    }
  } else if (state === "line") {
    if (c === "\n") {
      state = "code";
    }
  } else if (state === "block") {
    if (c === "*" && n === "/") {
      state = "code";
      i++;
      col++;
    }
  } else if (state === "string") {
    if (c === "\\") {
      i++;
      col++;
    } else if (c === quote) {
      state = "code";
    }
  } else if (state === "template") {
    if (c === "\\") {
      i++;
      col++;
    } else if (c === "`") {
      state = "code";
    }
  }

  if (c === "\n") {
    line++;
    col = 0;
  } else {
    col++;
  }
}

console.log("");
console.log("========================================");
console.log("BRACE CHECK");
console.log("========================================");

console.log(`Unclosed { count: ${stack.length}`);

if (stack.length > 0) {
  console.log("");
  console.log("Unclosed opening braces:");

  for (const item of stack) {
    console.log(
      `  { opened at line ${item.line}, column ${item.col}`
    );
  }
}

console.log("");
console.log(`Final parser state: ${state}`);
console.log("========================================");