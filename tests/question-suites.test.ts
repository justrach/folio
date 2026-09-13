import assert from "node:assert/strict";
import test from "node:test";
import { parseQuestionSuiteInput, QUESTION_SUITE_MAX_QUESTIONS, QUESTION_SUITE_MAX_QUESTION_LENGTH } from "../src/lib/question-suite-input";

const draft = {
  name: "Customer buying questions", websiteId: "site-A_123", questions: ["What are the delivery options?"],
  language: "English", locale: "United States",
};

test("question drafts accept one through ten questions, trim text, and preserve question order", () => {
  assert.equal(QUESTION_SUITE_MAX_QUESTIONS, 10);
  assert.equal(QUESTION_SUITE_MAX_QUESTION_LENGTH, 300);
  for (let count = 1; count <= 10; count++) {
    const questions = Array.from({ length: count }, (_, index) => ` Question ${index + 1}: ${"a".repeat(285)} `);
    const input = { ...draft, name: "  Customer questions  ", websiteId: " site-A_123 ", questions };
    const before = JSON.stringify(input);
    const parsed = parseQuestionSuiteInput(input);
    assert.equal(parsed.name, "Customer questions");
    assert.equal(parsed.websiteId, "site-A_123");
    assert.deepEqual(parsed.questions, questions.map(question => question.trim()));
    assert.equal(JSON.stringify(input), before, "Validation must not mutate the editor draft.");
    assert.notEqual(parsed.questions, questions);
  }
  assert.deepEqual(parseQuestionSuiteInput({ name: "Questions", websiteId: "site", questions: ["Why this service?"] }), {
    name: "Questions", websiteId: "site", questions: ["Why this service?"], language: "English", locale: "United States",
  });
});

test("question drafts reject nonobjects and unsupported ownership, target, or execution fields", () => {
  for (const input of [undefined, null, false, 1, "draft", []]) assert.throws(() => parseQuestionSuiteInput(input), /suite object/);
  for (const field of ["ownerId", "userId", "targetUrl", "searchMode", "model", "runId", "start", "budget", "referenceFacts"])
    assert.throws(() => parseQuestionSuiteInput({ ...draft, [field]: "untrusted" }), /unsupported field/, field);
  const prototypeField = JSON.parse(JSON.stringify(draft).slice(0, -1) + ',"__proto__":{"ownerId":"other"}}');
  assert.throws(() => parseQuestionSuiteInput(prototypeField), /unsupported field/);
});

test("question count, item types, trimmed blanks, and duplicate questions are rejected", () => {
  for (const questions of [undefined, null, "Question?", {}, [], Array.from({ length: 11 }, (_, index) => `Question ${index}?`)])
    assert.throws(() => parseQuestionSuiteInput({ ...draft, questions }), /Add 1–10 questions/);
  for (const question of [null, undefined, 42, {}, [], "", "   ", "a".repeat(301)])
    assert.throws(() => parseQuestionSuiteInput({ ...draft, questions: [question] }), /each question/);
  for (const questions of [["What does it cost?", "What does it cost?"], ["What does it cost?", "  WHAT DOES IT COST?  "]])
    assert.throws(() => parseQuestionSuiteInput({ ...draft, questions }), /duplicate questions/);
  assert.deepEqual(parseQuestionSuiteInput({ ...draft, questions: ["What does it cost?", "What does delivery cost?"] }).questions,
    ["What does it cost?", "What does delivery cost?"]);
});

test("suite fields enforce their exact text bounds and saved-website ID format", () => {
  for (const [field, limit] of [["name", 100], ["websiteId", 128], ["language", 40], ["locale", 40]] as const) {
    assert.equal(parseQuestionSuiteInput({ ...draft, [field]: "x".repeat(limit) })[field], "x".repeat(limit));
    for (const value of ["", "   ", 42, {}, "x".repeat(limit + 1)])
      assert.throws(() => parseQuestionSuiteInput({ ...draft, [field]: value }), /characters/, `${field}: ${String(value)}`);
  }
  for (const websiteId of ["-site", "_site", "site/path", "site.name", "site name", "https://example.test", "site?owner=bob", "学習"])
    assert.throws(() => parseQuestionSuiteInput({ ...draft, websiteId }), /saved website/);
  assert.equal(parseQuestionSuiteInput({ ...draft, questions: ["q".repeat(300)] }).questions[0].length, 300);
});

test("control characters are rejected throughout names, website IDs, locale, language, and questions", () => {
  for (const code of [0x00, 0x09, 0x0a, 0x0d, 0x1f, 0x7f]) {
    const control = String.fromCharCode(code);
    for (const field of ["name", "websiteId", "language", "locale"] as const)
      assert.throws(() => parseQuestionSuiteInput({ ...draft, [field]: `before${control}after` }), /control characters/);
    assert.throws(() => parseQuestionSuiteInput({ ...draft, questions: [`Question${control}?`] }), /control characters/);
  }
});

test("international questions survive unchanged and the total bound is UTF-8 bytes, including JSON", () => {
  const multilingual = { ...draft, language: "日本語", locale: "日本", questions: ["返品できますか？", "配送には何日かかりますか？"] };
  assert.deepEqual(parseQuestionSuiteInput(multilingual), multilingual);

  const boundary = { ...draft, questions: Array.from({ length: 10 }, (_, index) => `${index}${"界".repeat(120)}`) };
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  let remaining = 4096 - bytes(boundary);
  assert.ok(remaining > 0);
  for (let index = 0; remaining > 0 && index < boundary.questions.length; index++) {
    const padding = Math.min(300 - boundary.questions[index].length, remaining);
    boundary.questions[index] += "a".repeat(padding);
    remaining -= padding;
  }
  assert.equal(remaining, 0);
  assert.equal(bytes(boundary), 4096);
  assert.ok(JSON.stringify(boundary).length < 4096, "The fixture distinguishes Unicode characters from UTF-8 bytes.");
  assert.deepEqual(parseQuestionSuiteInput(boundary), boundary);
  const tooLarge = { ...boundary, questions: [...boundary.questions] };
  tooLarge.questions[9] += "a";
  assert.ok(tooLarge.questions.every(question => question.length <= 300));
  assert.equal(bytes(tooLarge), 4097);
  assert.throws(() => parseQuestionSuiteInput(tooLarge), /4 KB/);
});
