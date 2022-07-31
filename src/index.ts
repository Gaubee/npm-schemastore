#!/usr/bin/node

import fs from "node:fs";
import path from "node:path";
import api from "./catalog.json";
import { BASE_HOST, JSON_SCHEMA_ROOT } from "./const";

const ROOT = process.cwd();

const [cmd, ...args] = process.argv.slice(2);

export const doBin = async () => {
  switch (cmd) {
    case undefined:
      doAutoFix();
      break;
    case "find":
    case "search":
      doSearch(args);
      break;
    case "add":
      doAdd(args);
      break;
  }
};

export const doAutoFix = () => {
  const words = fs
    .readdirSync(ROOT)
    .filter((name) => fs.statSync(path.join(ROOT, name)).isFile())
    .map((word) => `=${word}`);

  return doAdd(words);
};
export const doAdd = async (search_words: string[]) => {
  if (search_words.length === 0) {
    return;
  }
  console.group("add by keys:", search_words);
  const vscodeSettingsJsonFilepath = path.join(ROOT, ".vscode/settings.json");

  let vscodeSettingsJson;
  /// read .vscode/setting.json
  {
    if (fs.existsSync(vscodeSettingsJsonFilepath) === false) {
      fs.mkdirSync(path.dirname(vscodeSettingsJsonFilepath), {
        recursive: true,
      });
      vscodeSettingsJson = {};
    } else {
      vscodeSettingsJson = new Function(
        `return (${
          fs.readFileSync(vscodeSettingsJsonFilepath, "utf-8").trim() || "{}"
        })`
      )();
    }
  }

  const jsonSchemasList = vscodeSettingsJson["json.schemas"] ?? [];
  const fileMatchs = new Set();
  for (const schemaConfig of jsonSchemasList) {
    for (const match of schemaConfig.fileMatch) {
      fileMatchs.add(match);
    }
  }

  const fixUrl = (url: string) => {
    if (url.startsWith(BASE_HOST) === false) {
      return url;
    }
    return path
      .relative(ROOT, path.join(JSON_SCHEMA_ROOT, url.slice(BASE_HOST.length)))
      .replace(/\\/g, "/");
  };

  const newJsonSchemasList = jsonSchemasList.slice();
  for (const schema of search(search_words)) {
    if (schema.fileMatch.every((match) => fileMatchs.has(match))) {
      continue;
    }
    schema.url = fixUrl(schema.url);
    const versions: any = schema.versions;
    if (versions) {
      for (const version in versions) {
        versions[version] = fixUrl(versions[version]);
      }
    }
    newJsonSchemasList.push(schema);
    console.log("added", schema.name, schema.fileMatch);
  }
  if (newJsonSchemasList.length > jsonSchemasList.length) {
    vscodeSettingsJson["json.schemas"] = newJsonSchemasList;
    fs.writeFileSync(
      vscodeSettingsJsonFilepath,
      JSON.stringify(vscodeSettingsJson, null, 2)
    );
  }
};

export const search = function* (search_words: string[]) {
  const searchFuns = search_words.map((word: string) => {
    if (word.startsWith("/") && word.endsWith("/")) {
      const reg = new RegExp(word.slice(1, -1));
      console.log(reg);
      return (str: string) => reg.test(str);
    } else if (word.startsWith("^") || word.startsWith("~")) {
      const start = word.slice(1);
      return (str: string) => str.startsWith(start);
    } else if (word.startsWith("$")) {
      const end = word.slice(1);
      return (str: string) => str.endsWith(end);
    } else if (word.startsWith("=")) {
      const equal = word.slice(1);
      return (str: string) => str === equal;
    } else {
      return (str: string) => str.includes(word);
    }
  });
  for (const schema of api.schemas) {
    if (
      schema.url.startsWith(BASE_HOST) &&
      schema.fileMatch?.some((filename) =>
        searchFuns.some((sfun) => sfun(filename))
      )
    ) {
      yield schema;
    }
  }
};

export const doSearch = async (search_words: string[]) => {
  console.group("searching by keys:", search_words);
  for (const schema of search(search_words)) {
    console.log(
      "found name: %o fileMatch: %O description: %o",
      schema.name,
      schema.fileMatch,
      schema.description
    );
  }
};
