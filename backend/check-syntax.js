const fs = require("fs");

const s = fs.readFileSync("src/server.ts", "utf8");

const stack = [];

let line = 1;
let col = 0;
let state = "code";
let quote = "";

function position() {
  return `line ${line}, column ${col + 1}`;
}

for (let i = 0; i < s.length; i++) {
  const c = s[i];
  const n = s[i + 1];

  if (state === "line") {
    if (c === "\n") state = "code";
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
  } else {
    // CODE

    if (c === "/" && n === "/") {
      state = "line";
      i++;
      col++;
    } else if (c === "/" && n === "*") {
      state = "block";
      i++;
      col++;
    } else if (c === '"' || c === "'") {
      state = "string";
      quote = c;
    } else if (c === "`") {
      state = "template";
    } else if (c === "{") {
      stack.push({
        char: "{",
        line,
        col: col + 1,
      });
    } else if (c === "(") {
      stack.push({
        char: "(",
        line,
        col: col + 1,
      });
    } else if (c === "[") {
      stack.push({
        char: "[",
        line,
        col: col + 1,
      });
    } else if (c === "}") {
      const last = stack[stack.length - 1];

      if (!last || last.char !== "{") {
        console.log(`MISMATCH } at ${position()}`);
      } else {
        stack.pop();
      }
    } else if (c === ")") {
      const last = stack[stack.length - 1];

      if (!last || last.char !== "(") {
        console.log(`MISMATCH ) at ${position()}`);
      } else {
        stack.pop();
      }
    } else if (c === "]") {
      const last = stack[stack.length - 1];

      if (!last || last.char !== "[") {
        console.log(`MISMATCH ] at ${position()}`);
      } else {
        stack.pop();
      }
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
console.log("STRUCTURAL CHECK");
console.log("========================================");

console.log("Final state:", state);
console.log("Unclosed structures:", stack.length);

if (stack.length) {
  console.log("");
  console.log("Remaining openings:");

  for (const item of stack) {
    console.log(
      `${item.char} opened at line ${item.line}, column ${item.col}`
    );
  }
}

console.log("========================================");