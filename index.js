"use strict";
class Ok {
    constructor(value) {
        this.value = value;
        this.ok = true;
        this.err = false;
    }
    get get() {
        return this.value;
    }
    map(callback) {
        this.value = callback(this.value);
        return this;
    }
}
class Err {
    constructor(value) {
        this.value = value;
        this.ok = false;
        this.err = true;
    }
    get get() {
        throw this.value;
    }
    map(_callback) {
        return this;
    }
}
class Some {
    constructor(value) {
        this.some = true;
        this.none = false;
        this.value = value;
    }
    get get() {
        return this.value;
    }
    fetch(_fail) {
        return this.value;
    }
    map(callback) {
        this.value = callback(this.value);
        return this;
    }
}
class None {
    constructor() {
        this.some = false;
        this.none = true;
    }
    get get() {
        throw new Error("never");
    }
    fetch(fail) {
        return fail();
    }
    map(_callback) {
        return this;
    }
}
class Scanner {
    constructor(script, line_number) {
        this.index = 0;
        this.start_line_number = line_number;
        this.lines = [];
        for (let line of script.split("\n")) {
            line = toHalfWidth(line).trim();
            this.lines.push(line);
        }
    }
    getLine() {
        let result = this.lines[this.index];
        this.index++;
        if (result !== undefined) {
            return new Some(result);
        }
        else {
            return new None();
        }
    }
    get line_number() {
        return this.start_line_number + this.index;
    }
}
class Block {
    constructor(context) {
        this.list = [];
        this.context = context.branch();
    }
    push(value) {
        this.list.push(value);
    }
    run() {
        let script = this.list.join("\n");
        return run(script, this.context.branch());
    }
}
class Context {
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
    branch() {
        let c = new Context();
        c.line_number = this.line_number;
        c.scope = this.scope;
        c.functions = this.functions;
        return c;
    }
    scannerGetLine() {
        var _a;
        let s = (_a = this.scanner) !== null && _a !== void 0 ? _a : never();
        this.line_number++;
        return s.getLine();
    }
}
function run(script, context) {
    let result;
    context.scanner = new Scanner(script, context.line_number);
    for (;;) {
        let line = context.scannerGetLine();
        if (line.none)
            break;
        result = parseExpression(line.get, context);
    }
    return result === null || result === void 0 ? void 0 : result.fetch(() => undefined);
}
function parseExpression(sentence, context) {
    if (isEmptySentence(sentence)) {
        return new None();
    }
    let result;
    result = parseDefineVariable(sentence, context);
    if (result.some)
        return result;
    result = parseIf(sentence, context);
    if (result.some)
        return result;
    result = parseBlock(sentence, context);
    if (result.some)
        return result;
    result = parseLiteral(sentence);
    if (result.some)
        return result;
    result = parseCallFunction(sentence, context);
    if (result.some)
        return result;
    result = parseCallVariable(sentence, context);
    if (result.some)
        return result;
    userError(`構文エラー: ${sentence}`, context);
}
function parseBlock(sentence, context) {
    var _a;
    if (sentence == "ここから") {
        let block = new Block(context);
        for (;;) {
            let result = context.scannerGetLine();
            if (result.none)
                userError("「ここまで」が見つかりませんでした。", context);
            let line = result.get;
            if (line.includes("ここまで")) {
                let splinters = line.split("ここまで");
                block.push((_a = splinters.shift()) !== null && _a !== void 0 ? _a : never());
                context.proactiveExpression = block;
                return parseBlockAfter(splinters.join(), context);
            }
            block.push(line);
        }
    }
    return new None();
}
function parseBlockAfter(sentence, context) {
    var _a;
    let result;
    let block = (_a = context.proactiveExpression) !== null && _a !== void 0 ? _a : never();
    result = match(sentence, /を処理/, () => {
        return block.run();
    });
    if (result.some)
        return result;
    result = match(sentence, /を(.*)回繰り返す/, (numStr) => {
        let number = parseExpression(numStr, context).fetch(() => userError(`構文エラー: ${numStr}`, context));
        if (typeof number !== "number")
            userError(`引数エラー: ${numStr} は数値ではありません。`, context);
        for (let i = 0; i < number; i++) {
            block.run();
        }
    });
    if (result.some)
        return result;
    userError(`構文エラー: ${sentence}`, context);
}
function parseLiteral(sentence) {
    let result;
    result = match(sentence, /^([+-]?\d+(?:\.\d+)?)$/, (num) => {
        return Number(toHalfWidth(num));
    });
    if (result.some)
        return result;
    result = match(sentence, /^「(.*)」$/, (str) => {
        return str;
    });
    if (result.some)
        return result;
    result = match(sentence, /^(正しい|正しくない)$/, (str) => {
        return str == "正しい";
    });
    if (result.some)
        return result;
    return new None();
}
function isEmptySentence(sentence) {
    return /^\s*$/.test(sentence);
}
function parseDefineVariable(sentence, context) {
    return match(sentence, /(.*)を(.*)とする/, (name, value) => {
        let result = parseExpression(value, context);
        context.scope[name] = result.fetch(() => userError(`構文エラー：${value}`, context));
    });
}
function parseIf(sentence, context) {
    let result;
    result = match(sentence, /もし(.*)ならば(.*)違うなら(.*)/, (condition, then_sentence, else_sentence) => {
        let result = parseExpression(condition, context);
        if (result.fetch(() => userError(`構文エラー：${condition}`, context))) {
            result = parseExpression(then_sentence, context);
            return result.fetch(() => userError(`構文エラー：${then_sentence}`, context));
        }
        else {
            result = parseExpression(else_sentence, context);
            return result.fetch(() => userError(`構文エラー：${else_sentence}`, context));
        }
    });
    if (result.some)
        return result;
    result = match(sentence, /もし(.*)ならば(.*)/, (condition, then_sentence) => {
        let result = parseExpression(condition, context);
        if (result.fetch(() => userError(`構文エラー：${condition}`, context))) {
            result = parseExpression(then_sentence, context);
            return result.fetch(() => userError(`構文エラー：${then_sentence}`, context));
        }
    });
    if (result.some)
        return result;
    return new None();
}
function parseCallFunction(sentence, context) {
    for (let f of context.functions) {
        if (sentence.includes(f.name)) {
            return new Some(applyFunction(f, sentence, context));
        }
    }
    return new None();
}
function applyFunction(funcData, sentence, context) {
    let index = sentence.indexOf(funcData.name);
    sentence = sentence.slice(0, index);
    let args = {};
    let noun = "";
    let tokens = splitWords(sentence, funcData.caseParticles);
    for (let token of tokens) {
        if (funcData.caseParticles.some((i) => i === token)) {
            let result = parseExpression(noun, context);
            args[token] = result.fetch(() => userError(`構文エラー：${noun}`, context));
        }
        else {
            noun = token;
        }
    }
    return funcData.procedure(args, context);
}
function parseCallVariable(sentence, context) {
    if (context.scope.hasOwnProperty(sentence)) {
        return new Some(context.scope[sentence]);
    }
    else {
        return new None();
    }
}
function match(string, regexp, func) {
    let m = regexp.exec(string);
    if (m === null)
        return new None();
    let result = func(...m.slice(1));
    return new Some(result);
}
function splitWords(text, words) {
    return recSplitWords([text], [...words]);
}
function recSplitWords(text_list, words) {
    let word = words.shift();
    if (word === undefined) {
        return text_list;
    }
    let result = [];
    for (let text of text_list) {
        result = result.concat(splitWord(text, word));
    }
    return recSplitWords(result, words);
}
function splitWord(text, word) {
    let index = text.indexOf(word);
    if (index === -1) {
        return [text];
    }
    let head = text.slice(0, index);
    let tail = text.slice(index + word.length);
    let result = [];
    if (head === "" && tail === "") {
        result = [word];
    }
    else if (head === "") {
        result = [word, ...splitWord(tail, word)];
    }
    else if (tail === "") {
        result = [head, word];
    }
    else {
        result = [head, word, ...splitWord(tail, word)];
    }
    return result;
}
// 半角に変換する
function toHalfWidth(string) {
    return string
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (s) {
        return String.fromCharCode(s.charCodeAt(0) - 0xfee0);
    })
        .replace(/[　、]/g, "");
}
function userError(message, context) {
    let text = `${message} : ${context.line_number}行目ぐらい`;
    throw new Error(text);
}
function never() {
    throw new Error("never");
}
function debug(...value) {
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
