class Ok<T> {
  value: T;
  ok: boolean;
  err: boolean;

  constructor(value: T) {
    this.value = value;
    this.ok = true;
    this.err = false;
  }

  get get(): T {
    return this.value;
  }

  map(callback: (value: T) => T): Ok<T> {
    this.value = callback(this.value);
    return this;
  }
}
class Err<T> {
  value: T;
  ok: boolean;
  err: boolean;

  constructor(value: T) {
    this.value = value;
    this.ok = false;
    this.err = true;
  }

  get get(): T {
    throw this.value;
  }

  map(_callback: Function): Err<T> {
    return this;
  }
}
type Result<A, B> = Ok<A> | Err<B>;

class Some<T> {
  value: T;
  some = true;
  none = false;

  constructor(value: T) {
    this.value = value;
  }

  get get(): T {
    return this.value;
  }

  fetch(_fail: Function): T {
    return this.value;
  }

  map(callback: (value: T) => T): Some<T> {
    this.value = callback(this.value);
    return this;
  }
}
class None {
  some = false;
  none = true;

  get get(): never {
    throw new Error("never");
  }

  fetch<T>(fail: () => T): T {
    return fail();
  }

  map(_callback: Function): None {
    return this;
  }
}
type Option<T> = None | Some<T>;

type JavaScriptValue = Object | void;
type Literal = number | string | boolean;

class Scanner {
  lines: string[];
  index: number;
  start_line_number: number;

  constructor(script: string, line_number: number) {
    this.index = 0;
    this.start_line_number = line_number;
    this.lines = [];
    for (let line of script.split("\n")) {
      line = toHalfWidth(line).trim();
      this.lines.push(line);
    }
  }

  getLine(): Option<string> {
    let result = this.lines[this.index];
    this.index++;
    if (result !== undefined) {
      return new Some(result);
    } else {
      return new None();
    }
  }

  get line_number(): number {
    return this.start_line_number + this.index;
  }
}

class Block {
  list: string[];
  context: Context;

  constructor(context: Context) {
    this.list = [];
    this.context = context.branch();
  }

  push(value: string) {
    this.list.push(value);
  }

  run(): JavaScriptValue {
    let script = this.list.join("\n");
    return run(script, this.context.branch());
  }
}

interface FuncData {
  name: string;
  caseParticles: Array<string>;
  procedure: (
    args: { [key: string]: JavaScriptValue },
    context: Context
  ) => JavaScriptValue;
}

class Context {
  line_number: number;
  scanner?: Scanner;
  proactiveExpression?: Block;
  scope: { [key: string]: JavaScriptValue };
  functions: Array<FuncData>;

  constructor() {
    this.line_number = 1;
    this.scope = {
      コンソール: console.log,
      アラート: alert,
    };
    this.functions = [
      {
        name: "表示",
        caseParticles: ["を", "に"],
        procedure: (args, context) => {
          let variable = args["を"];
          let output = args["に"];

          if (typeof output !== "function") {
            userError(`「${output}」に表示することはできません。`, context);
          }
          output(variable);
        },
      },

      {
        name: "小さい",
        caseParticles: ["より", "が"],
        procedure: (args, _context) => {
          let subject = args["が"];
          let than = args["より"];
          return subject < than;
        },
      },

      {
        name: "大きい",
        caseParticles: ["より", "が"],
        procedure: (args, _context) => {
          let subject = args["が"];
          let than = args["より"];
          return subject > than;
        },
      },
    ];
  }

  branch(): Context {
    let c = new Context();
    c.line_number = this.line_number;
    c.scope = this.scope;
    c.functions = this.functions;
    return c;
  }

  scannerGetLine(): Option<string> {
    let s = this.scanner ?? never();
    this.line_number++;
    return s.getLine();
  }
}

function run(script: string, context: Context): JavaScriptValue {
  let result;
  context.scanner = new Scanner(script, context.line_number);

  for (;;) {
    let line = context.scannerGetLine();
    if (line.none) break;
    result = parseExpression(line.get, context);
  }

  return result?.fetch(() => undefined);
}

function parseExpression(
  sentence: string,
  context: Context
): Option<JavaScriptValue> {
  if (isEmptySentence(sentence)) {
    return new None();
  }

  let result: Option<JavaScriptValue>;

  result = parseDefineVariable(sentence, context);
  if (result.some) return result;

  result = parseIf(sentence, context);
  if (result.some) return result;

  result = parseBlock(sentence, context);
  if (result.some) return result;

  result = parseLiteral(sentence);
  if (result.some) return result;

  result = parseCallFunction(sentence, context);
  if (result.some) return result;

  result = parseCallVariable(sentence, context);
  if (result.some) return result;

  userError(`構文エラー: ${sentence}`, context);
}

function parseBlock(
  sentence: string,
  context: Context
): Option<JavaScriptValue> {
  if (sentence == "ここから") {
    let block = new Block(context);
    for (;;) {
      let result = context.scannerGetLine();
      if (result.none)
        userError("「ここまで」が見つかりませんでした。", context);
      let line = result.get;
      if (line.includes("ここまで")) {
        let splinters = line.split("ここまで");
        block.push(splinters.shift() ?? never());
        context.proactiveExpression = block;
        return parseBlockAfter(splinters.join(), context);
      }
      block.push(line);
    }
  }
  return new None();
}

function parseBlockAfter(
  sentence: string,
  context: Context
): Option<JavaScriptValue> {
  let result;
  let block = context.proactiveExpression ?? never();

  result = match(sentence, /を処理/, () => {
    return block.run();
  });
  if (result.some) return result;

  result = match(sentence, /を(.*)回繰り返す/, (numStr) => {
    let number = parseExpression(numStr, context).fetch(() =>
      userError(`構文エラー: ${numStr}`, context)
    );
    if (typeof number !== "number")
      userError(`引数エラー: ${numStr} は数値ではありません。`, context);
    for (let i = 0; i < number; i++) {
      block.run();
    }
  });
  if (result.some) return result;

  userError(`構文エラー: ${sentence}`, context);
}

function parseLiteral(sentence: string): Option<Literal> {
  let result;

  result = match(sentence, /^([+-]?\d+(?:\.\d+)?)$/, (num) => {
    return Number(toHalfWidth(num));
  });
  if (result.some) return result;

  result = match(sentence, /^「(.*)」$/, (str) => {
    return str;
  });
  if (result.some) return result;

  result = match(sentence, /^(正しい|正しくない)$/, (str) => {
    return str == "正しい";
  });
  if (result.some) return result;

  return new None();
}

function isEmptySentence(sentence: string): boolean {
  return /^\s*$/.test(sentence);
}

function parseDefineVariable(
  sentence: string,
  context: Context
): Option<JavaScriptValue> {
  return match(sentence, /(.*)を(.*)とする/, (name, value) => {
    let result = parseExpression(value, context);
    context.scope[name] = result.fetch(() =>
      userError(`構文エラー：${value}`, context)
    );
  });
}

function parseIf(sentence: string, context: Context): Option<JavaScriptValue> {
  let result;
  result = match(
    sentence,
    /もし(.*)ならば(.*)違うなら(.*)/,
    (condition, then_sentence, else_sentence) => {
      let result = parseExpression(condition, context);
      if (result.fetch(() => userError(`構文エラー：${condition}`, context))) {
        result = parseExpression(then_sentence, context);
        return result.fetch(() =>
          userError(`構文エラー：${then_sentence}`, context)
        );
      } else {
        result = parseExpression(else_sentence, context);
        return result.fetch(() =>
          userError(`構文エラー：${else_sentence}`, context)
        );
      }
    }
  );
  if (result.some) return result;

  result = match(sentence, /もし(.*)ならば(.*)/, (condition, then_sentence) => {
    let result = parseExpression(condition, context);
    if (result.fetch(() => userError(`構文エラー：${condition}`, context))) {
      result = parseExpression(then_sentence, context);
      return result.fetch(() =>
        userError(`構文エラー：${then_sentence}`, context)
      );
    }
  });
  if (result.some) return result;

  return new None();
}

function parseCallFunction(
  sentence: string,
  context: Context
): Option<JavaScriptValue> {
  for (let f of context.functions) {
    if (sentence.includes(f.name)) {
      return new Some(applyFunction(f, sentence, context));
    }
  }

  return new None();
}

function applyFunction(
  funcData: FuncData,
  sentence: string,
  context: Context
): JavaScriptValue {
  let index = sentence.indexOf(funcData.name);
  sentence = sentence.slice(0, index);

  let args: { [key: string]: JavaScriptValue } = {};
  let noun = "";

  let tokens = splitWords(sentence, funcData.caseParticles);
  for (let token of tokens) {
    if (funcData.caseParticles.some((i) => i === token)) {
      let result = parseExpression(noun, context);
      args[token] = result.fetch(() =>
        userError(`構文エラー：${noun}`, context)
      );
    } else {
      noun = token;
    }
  }

  return funcData.procedure(args, context);
}

function parseCallVariable(
  sentence: string,
  context: Context
): Option<JavaScriptValue> {
  if (context.scope.hasOwnProperty(sentence)) {
    return new Some(context.scope[sentence]);
  } else {
    return new None();
  }
}

function match<T>(
  string: string,
  regexp: RegExp,
  func: (...args: string[]) => T
): Option<T> {
  let m = regexp.exec(string);
  if (m === null) return new None();

  let result = func(...m.slice(1));

  return new Some(result);
}

function splitWords(text: string, words: string[]): string[] {
  return recSplitWords([text], [...words]);
}

function recSplitWords(text_list: string[], words: string[]): string[] {
  let word = words.shift();
  if (word === undefined) {
    return text_list;
  }

  let result: string[] = [];
  for (let text of text_list) {
    result = result.concat(splitWord(text, word));
  }

  return recSplitWords(result, words);
}

function splitWord(text: string, word: string): string[] {
  let index = text.indexOf(word);
  if (index === -1) {
    return [text];
  }

  let head = text.slice(0, index);
  let tail = text.slice(index + word.length);
  let result = [];

  if (head === "" && tail === "") {
    result = [word];
  } else if (head === "") {
    result = [word, ...splitWord(tail, word)];
  } else if (tail === "") {
    result = [head, word];
  } else {
    result = [head, word, ...splitWord(tail, word)];
  }

  return result;
}

// 半角に変換する
function toHalfWidth(string: string): string {
  return string
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (s) {
      return String.fromCharCode(s.charCodeAt(0) - 0xfee0);
    })
    .replace(/[　、]/g, "");
}

function userError(message: string, context: Context): never {
  let text = `${message} : ${context.line_number}行目ぐらい`;
  throw new Error(text);
}

function never(): never {
  throw new Error("never");
}

function debug(...value: any[]): void {
  console.log("====", ...value);
}

/*
expression = if | for | block | litral | func_call | variable
block = ここから、(expression\n)*、expression?、ここまで
if = もし、expression、ならば、expression、（違えば、expression、）？
for = expression、を繰り返す
func_call = （expression、格助詞）＊関数名
litral = 数値！文字列！真偽値
*/
