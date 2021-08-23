// グローバル定数を定義
class Const {
  // 字句を定義する
  static readonly define_words = {
    delimiter: ["\n", "。"],
    string_start: ["「"],
    string_end: ["」"],
    evaluate_start: ["ここから", "("],
    evaluate_end: ["ここまで", ")"],
    if: ["もし"],
    then: ["ならば"],
    else: ["違うなら"],
    loop_target: ["を"],
    loop_count: ["回"],
    loop: ["繰り返す"],
    var_name: ["を"],
    var_value: ["とする"],
  };

  // 囲って読み込む必要がある字句
  //
  // 例：ここから〜ここまで、「〜」、もし〜なら
  // 囲いがあって中の文字列はエスケープする必要があるやつ。
  static readonly enclose_start_words = [
    Const.define_words.string_start,
    Const.define_words.evaluate_start,
    Const.define_words.if,
  ];

  // 文字列リテラルの正規表現
  static readonly string_regexp = new RegExp(
    `^${Const.define_words.string_start}(.*)${Const.define_words.string_end}$`,
    "i"
  );
}

// 失敗した場合にNoneを返し、成功した場合は結果をSomeでラップして返す。
type Option<T> = Some<T> | None;
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

// 成功した場合に OK<A> を返し、失敗した場合に Err<B> を返す関数などを想定。
type Result<A, B = never> = Ok<A> | Err<B>;
class Ok<T> {
  value: T;
  ok = true;
  err = false;

  constructor(value: T) {
    this.value = value;
  }
}
class Err<T> {
  value: T;
  ok = false;
  err = true;

  constructor(value: T) {
    this.value = value;
  }
}

// 「にほんご」の値ではなく JavaScript の値
type JavaScriptValue = Object | void;
// 「にほんご」で定義できるリテラルが対応している JavaScript の値
type Literal = number | string | boolean | undefined;

// 字句の型
class Lex {
  value: string;
  line_number: number;

  constructor(value: string, line_number: number) {
    this.value = value;
    this.line_number = line_number;
  }
}

// スクリプトを読み込んで、字句区切りで出力する
class Lexer {
  // TODO: 「なら」「違うなら」を区別できるようにしたい
  static run(script: string, line_number: number): Code {
    script = this.sanitize(script);
    let words = splitWords(script, Object.values(Const.define_words).flat());

    let lexicals: Lex[] = [];
    for (let word of words) {
      lexicals.push(new Lex(word, line_number));
      if (word === "\n") line_number++;
    }

    return new Code(lexicals);
  }

  // 空白を消したり半角に変換したりする
  private static sanitize(string: string): string {
    return string
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (s) {
        return String.fromCharCode(s.charCodeAt(0) - 0xfee0);
      })
      .replace(/[（]/g, "(")
      .replace(/[）]/g, ")")
      .replace(/[　、\t ]/g, "");
  }
}

// 字句のコレクションを操作するためのクラス
class Code implements Iterator<Lex, Lex, never> {
  // 字句の配列
  lexicals: Lex[];
  // lexicals をどこまで読み込んだかを示すインデックス
  index: number;
  // インデックスの値を記録しておくためのスタック。主に peek など読み込み位置を動かしたくない時に push & pop する
  indexStack: number[];

  constructor(lexicals: Lex[]) {
    this.lexicals = lexicals;
    this.index = 0;
    this.indexStack = [];
  }

  // 終わりまで読み込んでいたら true
  get isEnd(): boolean {
    return this.lexicals[this.index] === undefined;
  }

  // 空のコードなら true
  get isEmpty(): boolean {
    if (this.isEnd) return true;
    return this.lexicals.every((i) =>
      Const.define_words.delimiter.includes(i.value)
    );
  }

  // 先頭にある字句の行数
  get headLineNumber(): Option<number> {
    if (this.lexicals.length === 0) return new None();
    return new Some(this.lexicals[0].line_number);
  }

  // 最後尾にある字句の行数
  get tailLineNumber(): Option<number> {
    if (this.lexicals.length === 0) return new None();
    return new Some(this.lexicals[this.lexicals.length - 1].line_number);
  }

  // 参照ではなく値をコピーして作成する
  dup(): Code {
    let result = new Code([]);
    result.lexicals = [...this.lexicals];
    result.indexStack = [...this.indexStack];
    result.index = this.index;
    return result;
  }

  // 両端にある空白の字句を削除する
  trim(): void {
    let count = 0;
    for (let lex of [...this.lexicals]) {
      if (Const.define_words.delimiter.includes(lex.value)) {
        count++;
        this.lexicals.shift();
      } else {
        break;
      }
    }
    this.index = Math.max(0, this.index - count);

    for (let i = this.lexicals.length - 1; 0 < i; i--) {
      let lex = this.lexicals[i];
      if (Const.define_words.delimiter.includes(lex.value)) {
        this.lexicals.pop();
      } else {
        break;
      }
    }
  }

  // 文字列に変換
  toString(delimiter: string = ""): string {
    return this.lexicals.map((i) => i.value).join(delimiter);
  }

  // 反復オブジェクトにする
  [Symbol.iterator]() {
    return this;
  }
  next() {
    let result = this.readLex();
    if (result.some) {
      return { done: false, value: result.get };
    } else {
      return { done: true, value: new Lex("", -1) };
    }
  }

  // １つの字句だけ読み取る
  readLex(): Option<Lex> {
    if (this.isEnd) return new None();
    let lex = this.lexicals[this.index];
    this.index++;
    return new Some(lex);
  }

  // １つの字句だけ読み取るが、シークは動かない
  peekLex(): Option<Lex> {
    this.storeIndex();
    let result = this.readLex();
    this.restoreIndex();
    return result;
  }

  // 終端から１つの字句だけ読み取る。シークは動かない
  peekLastLex(): Option<Lex> {
    let result = this.lexicals[this.lexicals.length - 1];
    if (result === undefined) {
      return new None();
    } else {
      return new Some(result);
    }
  }

  // １行読み取る。
  readLine(): Option<Code> {
    if (this.isEnd) return new None();

    let lexicals: Lex[] = [];
    for (;;) {
      let lex = this.readLex();
      if (lex.none) break;
      if (Const.define_words.delimiter.includes(lex.get.value)) {
        lexicals.push(lex.get);
        break;
      }
      if (this.isEnclose(lex.get)) {
        lexicals = lexicals.concat(this.getEnclose(lex.get));
        continue;
      }
      lexicals.push(lex.get);
    }

    let result = new Code(lexicals);
    return new Some(result);
  }

  // １行読み取るが、シークは動かない。
  peekLine(): Option<Code> {
    this.storeIndex();
    let result = this.readLine();
    this.restoreIndex();
    return result;
  }

  // 残りの全てを読み取る
  private readRest(): Code {
    let lexicals: Lex[] = [];

    for (;;) {
      let lex = this.readLex();
      if (lex.none) break;
      lexicals.push(lex.get);
    }

    return new Code(lexicals);
  }

  // fn が true を返すまでのコードを読み取る。
  // 囲いがあってもエスケープしない。true を返した字句も読み取る。
  private readUntilRaw(
    fn: (lex: Lex) => boolean
  ): { code: Code; hit: boolean } {
    let lexicals: Lex[] = [];

    for (;;) {
      let lex = this.readLex();
      if (lex.none) {
        return { code: new Code(lexicals), hit: false };
      }

      lexicals.push(lex.get);
      if (fn(lex.get)) {
        return { code: new Code(lexicals), hit: true };
      }
    }
  }

  // 条件を達成するまでのコードを読み取る。文字列などの囲いはエスケープする
  //
  // fn - 条件の達成を判定する
  // option - {includeHit: 条件を達成した字句を結果に含めるかどうか}
  private readUntilEscape(
    fn: (lex: Lex) => boolean,
    option: { includeHit?: boolean } = {}
  ): { code: Code; hit: boolean } {
    // デフォルトオプションを設定する
    option = {
      includeHit: true,
      ...option,
    };

    let lexicals: Lex[] = [];

    for (;;) {
      let lex = this.readLex();
      if (lex.none) {
        return { code: new Code(lexicals), hit: false };
      }

      if (this.isEnclose(lex.get)) {
        lexicals = lexicals.concat(this.getEnclose(lex.get));
        continue;
      }

      if (fn(lex.get)) {
        if (option.includeHit) lexicals.push(lex.get);
        return { code: new Code(lexicals), hit: true };
      } else {
        lexicals.push(lex.get);
      }
    }
  }

  // パターンとマッチするかどうか、マッチした場合はキャプチャした Code をコールバックする
  match<T>(
    pattarn: Array<string[] | null>,
    callback: (...args: Code[]) => T
  ): Option<T> {
    // pattern の中で CAPTURE_KEYWORD が出てきたら、次のキーワードが出てくるまで捕捉し続けることを意味する
    const CAPTURE_KEYWORD = null;
    let captureCount = 0;
    let args: Code[] = [];

    pattarn = [...pattarn];
    this.storeIndex();

    // pattern に沿って解析していく
    for (;;) {
      let keywords = pattarn.shift();
      if (keywords === undefined) break;

      if (keywords === CAPTURE_KEYWORD) {
        // 捕捉キーワードだった場合

        captureCount++;

        keywords = pattarn.shift();
        if (keywords === CAPTURE_KEYWORD) {
          never("キャプチャを2回続けて指定している");
        }

        if (keywords === undefined) {
          // never("キャプチャを終了するためのキーワードが存在しない
          args.push(this.readRest());
        } else {
          // 指定されたキーワードが出るまでを取得する
          let { code, hit } = this.readUntilEscape(
            (lex) => keywords?.includes(lex.value) ?? never(),
            { includeHit: false }
          );
          if (!hit) {
            this.restoreIndex();
            return new None();
          }
          args.push(code);
        }
      } else {
        // 捕捉キーワードではなく、ただのキーワードだった場合

        let { done, value: lex } = this.next();
        if (done) {
          // keyword が存在しないまま解析が終了した
          this.restoreIndex();
          return new None();
        }
        if (!keywords.includes(lex.value)) {
          // keyword が一致しなかった
          this.restoreIndex();
          return new None();
        }
      }
    }

    if (captureCount !== args.length) {
      never(
        `捕捉した数が一致していない。count: ${captureCount}, args: ${args}`
      );
    }
    this.resetIndexStack();
    return new Some(callback(...args));
  }

  // ユーザー側のエラーが出た際に、行数などの位置情報のメッセージを作成する
  positionMessage(): string {
    // TODO: エラー表示が親切にしたい
    if (this.lexicals.length === 0) never("コードが空です。");
    const first_num = this.headLineNumber.get;
    const last_num = this.tailLineNumber.get;
    let result = "";

    if (first_num === last_num) {
      result = `${first_num}行目くらい`;
    } else {
      result = `${first_num}〜${last_num}行目くらい`;
    }
    return result;
  }

  private storeIndex(): void {
    this.indexStack.push(this.index);
  }
  private restoreIndex(): void {
    this.index = this.indexStack.pop() ?? never();
  }
  private resetIndexStack(): void {
    this.indexStack = [];
  }

  // ここから、もしなどの、キーワードで囲む語彙かどうかを判定する
  private isEnclose(lex: Lex): boolean {
    return Const.enclose_start_words.flat().includes(lex.value);
  }

  // ここから、もしなどの、キーワードで囲まれた部分を読み込む
  private getEnclose(startWord: Lex): Lex[] {
    if (Const.define_words.string_start.includes(startWord.value)) {
      return this.getEncloseString(startWord);
    } else if (Const.define_words.evaluate_start.includes(startWord.value)) {
      return this.getEncloseEvaluate(startWord);
    } else if (Const.define_words.if.includes(startWord.value)) {
      return this.getEncloseIf(startWord);
    } else {
      never();
    }
  }

  private getEncloseString(startWord: Lex): Lex[] {
    const endWords = Const.define_words.string_end;
    let result: Lex[] = [];

    result.push(startWord);

    let { code, hit } = this.readUntilRaw((lex) =>
      endWords.includes(lex.value)
    );

    if (!hit) {
      userSyntaxError(
        `${endWords}が見つかりません。`,
        positionMessage(startWord)
      );
    }

    return result.concat(code.lexicals);
  }

  private getEncloseEvaluate(startWord: Lex): Lex[] {
    const endWords = Const.define_words.evaluate_end;
    let result: Lex[] = [];

    result.push(startWord);

    // TODO: 全部の囲い字句を Escape してはダメ。自分と同じ字句のみエスケープする必要がある
    let { code, hit } = this.readUntilEscape((lex) => {
      return endWords.includes(lex.value);
    });

    if (!hit) {
      userSyntaxError(
        `${endWords}が見つかりません。code: ${code.toString(" ")}`,
        positionMessage(startWord)
      );
    }

    return result.concat(code.lexicals);
  }

  private getEncloseIf(startWord: Lex): Lex[] {
    const thenWords = Const.define_words.then;
    const delimiter = Const.define_words.delimiter;
    let result: Lex[] = [];

    // if ~ then までを取得
    result.push(startWord);
    // TODO: 全部の囲い字句を Escape してはダメ。自分と同じ字句のみエスケープする必要がある
    let { code, hit } = this.readUntilEscape((lex) =>
      thenWords.includes(lex.value)
    );
    if (!hit) {
      userSyntaxError(
        `${thenWords}が見つかりません。`,
        positionMessage(startWord)
      );
    }
    result = result.concat(code.lexicals);

    // then ~ delimiter までを取得
    ({ code, hit } = this.readUntilEscape((lex) =>
      delimiter.includes(lex.value)
    ));
    result = result.concat(code.lexicals);

    return result;
  }
}

// にほんごにおける関数のデータ構造
interface FuncData {
  name: string;
  caseParticles: Array<string>;
  procedure: (
    args: { [key: string]: JavaScriptValue },
    context: Context
  ) => JavaScriptValue;
}

// パーサー中の文脈情報。変数のスコープなど
class Context {
  scope: { [key: string]: JavaScriptValue };
  functions: Array<FuncData>;
  // 現在パースしているコードを記録し、エラーに役立てる
  parceCode?: Code;

  constructor() {
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
            userArgumenntError(
              `「${output}」に表示することはできません。`,
              positionMessage(context.parceCode ?? never())
            );
          }
          output(variable);
        },
      },

      {
        name: "デバッグ表示",
        caseParticles: ["を"],
        procedure: (args, _context) => {
          let variable = args["を"];

          console.log(variable);
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
}

/*
作るときに使ったメモ書き程度の文法規則。全然厳密じゃないし更新してない

statement = define_var | if | loop | call_func
define_var = symbol、を、expression、とする
if = もし、expression、ならば、expression、(違えば、expression)?
loop = expression、を繰り返す
call_func = (expression、格助詞)*、関数名.*
expression = statement | litral | procedure | symbol
litral = 数値|文字列|真偽値
symbol = .*
*/

function parseExpression(code: Code, context: Context): JavaScriptValue {
  code.trim();
  context.parceCode = code.dup();
  console.debug(context.parceCode);
  if (code.isEmpty) userSyntaxErrorByCode(code);
  let result: Option<JavaScriptValue>;

  result = parseIf(code, context);
  if (result.some) return result.get;

  result = parseLoop(code, context);
  if (result.some) return result.get;

  result = parseDefineVariable(code, context);
  if (result.some) return result.get;

  result = parseEvaluate(code, context);
  if (result.some) return result.get;

  result = parseCallFunction(code, context);
  if (result.some) return result.get;

  result = parseCallVariable(code, context);
  if (result.some) return result.get;

  result = parseLiteral(code, context);
  if (result.some) return result.get;

  userSyntaxErrorByCode(context.parceCode);
}

function parseIf(code: Code, context: Context): Option<JavaScriptValue> {
  if (code.isEmpty) return new None();
  const head = code.peekLex().get;
  if (!Const.define_words.if.includes(head.value)) return new None();

  let result: Option<JavaScriptValue>;
  const ifWord = Const.define_words.if;
  const thenWord = Const.define_words.then;
  const elseWord = Const.define_words.else;
  const delimiter = Const.define_words.delimiter;

  // 真偽値の判定をする関数
  const isTrue = (value: any): boolean => {
    return !(value === false || value === undefined || value === null);
  };

  const ifThenElseHnadler = (
    conditionCode: Code,
    thenCode: Code,
    elseCode: Code
  ) => {
    let condition = parseExpression(conditionCode, context);
    if (isTrue(condition)) {
      return parseExpression(thenCode, context);
    } else {
      return parseExpression(elseCode, context);
    }
  };

  result = code.match(
    [ifWord, null, thenWord, null, elseWord, null, delimiter],
    ifThenElseHnadler
  );
  if (result.some) return result;

  result = code.match(
    [ifWord, null, thenWord, null, elseWord, null],
    ifThenElseHnadler
  );
  if (result.some) return result;

  const ifThenHandler = (conditionCode: Code, thenCode: Code) => {
    let condition = parseExpression(conditionCode, context);
    if (isTrue(condition)) {
      return parseExpression(thenCode, context);
    }
  };

  result = code.match([ifWord, null, thenWord, null, delimiter], ifThenHandler);
  if (result.some) return result;

  result = code.match([ifWord, null, thenWord, null], ifThenHandler);
  if (result.some) return result;

  userSyntaxErrorByCode(code);
}

function parseLoop(code: Code, context: Context): Option<JavaScriptValue> {
  const tail = code.peekLastLex();
  if (tail.none) return new None();
  if (!Const.define_words.loop.includes(tail.get.value)) return new None();

  const loop = Const.define_words.loop;
  const count = Const.define_words.loop_count;
  const target = Const.define_words.loop_target;
  let result;

  result = code.match(
    [null, target, null, count, loop],
    (targetCode, countCode) => {
      for (let i = 0; i < parseExpression(countCode, context); i++) {
        parseExpression(targetCode.dup(), context);
      }
      return undefined;
    }
  );
  if (result.some) return result;

  result = code.match(
    [null, count, null, target, loop],
    (countCode, targetCode) => {
      for (let i = 0; i < parseExpression(countCode, context); i++) {
        parseExpression(targetCode.dup(), context);
      }
      return undefined;
    }
  );
  if (result.some) return result;

  userSyntaxErrorByCode(code);
}

function parseEvaluate(code: Code, context: Context): Option<JavaScriptValue> {
  let head = code.peekLex();
  if (head.none) return new None();
  if (!Const.define_words.evaluate_start.includes(head.get.value)) {
    return new None();
  }

  return code.match(
    [Const.define_words.evaluate_start, null, Const.define_words.evaluate_end],
    (code) => runCode(code, context)
  );
}

function parseLiteral(code: Code, _context: Context): Option<Literal> {
  const text = code.toString();

  let match = Const.string_regexp.exec(text);
  if (match) {
    match.shift();
    return new Some(match.shift() ?? never());
  }

  if (/^([+-]?\d+(?:\.\d+)?)$/.test(text)) {
    return new Some(Number(text));
  }

  if ("真" === text) {
    return new Some(true);
  }

  if ("偽" === text) {
    return new Some(false);
  }

  if ("空" === text) {
    return new Some(undefined);
  }

  return new None();
}

function parseDefineVariable(
  code: Code,
  context: Context
): Option<JavaScriptValue> {
  return code.match(
    [null, Const.define_words.var_name, null, Const.define_words.var_value],
    (nameCode, valueCode) => {
      context.scope[nameCode.toString()] = parseExpression(valueCode, context);
    }
  );
}

// TODO: リテラルの中の助詞を無視するようにする
function parseCallFunction(
  code: Code,
  context: Context
): Option<JavaScriptValue> {
  let f = findFunction(code, context.functions);
  if (f === undefined) {
    return new None();
  } else {
    return new Some(applyFunction(f, code, context));
  }
}

function findFunction(code: Code, functions: FuncData[]): FuncData | undefined {
  let result: FuncData | undefined = undefined;
  const sentence = code.toString();
  let maxIndex = 0;

  for (let f of functions) {
    let index = sentence.indexOf(f.name);
    if (index === -1) continue;

    const text = sentence.slice(0, index);
    let flag = f.caseParticles.every((particle) => text.includes(particle));
    if (!flag) continue;

    if (maxIndex < index) {
      result = f;
      maxIndex = index;
    }
  }

  return result;
}

function applyFunction(
  funcData: FuncData,
  code: Code,
  context: Context
): JavaScriptValue {
  let sentence = code.toString();
  let index = sentence.indexOf(funcData.name);
  sentence = sentence.slice(0, index);

  let args: { [key: string]: JavaScriptValue } = {};
  let noun: Code | undefined = undefined;

  let tokens = splitWords(sentence, funcData.caseParticles);
  for (let token of tokens) {
    if (funcData.caseParticles.some((i) => i === token)) {
      if (noun === undefined) {
        userSyntaxErrorByCode(context.parceCode, "引数が指定されていません。");
      }
      args[token] = parseExpression(noun, context);
    } else {
      let num = code.headLineNumber;
      if (num.none) {
        userSyntaxErrorByCode(context.parceCode, "引数が指定されていません。");
      }
      noun = Lexer.run(token, num.get);
    }
  }

  return funcData.procedure(args, context);
}

function parseCallVariable(
  code: Code,
  context: Context
): Option<JavaScriptValue> {
  if (context.scope.hasOwnProperty(code.toString())) {
    return new Some(context.scope[code.toString()]);
  } else {
    return new None();
  }
}

// 文字列を指定されたワードで分割する。分割に使ったワードも残る
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

// 文字列を指定されたワードで分割する。分割に使ったワードも残る
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

// にほんごプログラミングを使っているユーザー向けのエラー
function userSyntaxErrorByCode(
  code: Code | undefined,
  message: string | undefined = undefined
): never {
  // TODO: 無くしたい。過去のコードをスタックに積むか？
  if (code === undefined) never("コンテキストの解析中のコードが空です。");

  if (message === undefined) {
    message = code.toString(" ");
  } else {
    message = `${message} : ${code.toString(" ")}`;
  }

  userSyntaxError(message, positionMessage(code));
}

// にほんごプログラミングを使っているユーザー向けのエラー
function userSyntaxError(message: string, position: string): never {
  userError("構文エラー", message, position);
}

// にほんごプログラミングを使っているユーザー向けのエラー
function userArgumenntError(message: string, position: string): never {
  userError("引数エラー", message, position);
}

// にほんごプログラミングを使っているユーザー向けのエラー
function userError(type: string, message: string, position: string): never {
  throw new Error(`${type} : ${message} : ${position}`);
}

// エラーの位置情報
function positionMessage(code: Code | Lex): string {
  if (!(code instanceof Code)) {
    return `${code.line_number}行目くらい`;
  }

  return code.positionMessage();
}

function never(message: string = "never"): never {
  throw new Error(message);
}

// スクリプトを実行する
function run(script: string, context?: Context): JavaScriptValue {
  context ??= new Context();
  let code = Lexer.run(script, 1);

  return runCode(code, context);
}

function runCode(code: Code, context: Context): JavaScriptValue {
  let result;
  for (;;) {
    let line = code.readLine();
    if (line.none) break;
    line.get.trim();
    if (line.get.isEmpty) continue;
    result = parseExpression(line.get, context);
  }
  return result;
}
