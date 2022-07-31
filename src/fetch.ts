import chalk from "chalk";
import createHttpsProxyAgent from "https-proxy-agent";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import util from "node:util";
import api from "./catalog.json";
import { BASE_HOST, JSON_SCHEMA_ROOT } from "./const";

const fetchOptions: any = process.env.HTTPS_PROXY
  ? { agent: createHttpsProxyAgent(process.env.HTTPS_PROXY) }
  : {};
const doFetchJson = async (url: string) => {
  let retryTimes = 3;

  do {
    try {
      const fetchJson = (url: string, opts?: any) => {
        return fetch(url, opts).then((res) => {
          if (res.status !== 200) {
            if (res.status !== 404) {
              debugger;
            }
            throw new Error(res.statusText);
          }
          return res.json();
        });
      };
      const getjson = (url: string, opts?: any) => {
        return new Promise<any>((resolve, reject) => {
          https.get(url, opts, async (res) => {
            if (res.statusCode !== 200) {
              if (res.statusCode === 302 || res.statusCode === 301) {
                return resolve(getjson(res.headers.location!, opts));
              }
              debugger;
              return reject(res.statusMessage);
            }
            let text = "";
            for await (const chunk of res) {
              text += chunk;
            }
            return resolve(Function(`return (${text})`)());
          });
        });
      };

      if (retryTimes === 3) {
        return await fetchJson(url, fetchOptions);
      } else {
        return await getjson(url, fetchOptions);
      }
    } catch (err) {
      if ((err as Error).message === "Not Found") {
        console.log(chalk.gray("no found"), url);
        return {};
      }
      console.log(chalk.yellow("retrying"), url, (err as Error).message);
      if (retryTimes-- > 0) {
        continue;
      }
      throw err;
    }
  } while (true);
};

const isForce = process.argv.includes("--force");

const download = async (url: string) => {
  const urlInfo = new URL(url);
  const filepath = path.join(
    JSON_SCHEMA_ROOT,
    urlInfo.hostname,
    urlInfo.pathname
  );
  if (fs.existsSync(filepath)) {
    if (isForce === false) {
      console.log(chalk.cyan("use local file"), url, filepath);
      return filepath;
    }
  }
  console.log(
    chalk.blue("downloading"),
    url,
    path.relative(process.cwd(), filepath)
  );
  const remoteSchemaJson = await doFetchJson(url);

  if (fs.existsSync(filepath)) {
    const localeSchemaJson = JSON.parse(fs.readFileSync(filepath, "utf-8"));
    if (localeSchemaJson.$schema !== remoteSchemaJson.$schema) {
      console.error("冲突", url, filepath);
      return false;
    }
    if (util.isDeepStrictEqual(remoteSchemaJson, localeSchemaJson)) {
      return filepath;
    }
  } else {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
  }
  fs.writeFileSync(filepath, JSON.stringify(remoteSchemaJson, null, 2));
  return filepath;
};

const fixUrl = async (url: string, doFix: (newUrl: string) => void) => {
  if (url.startsWith(BASE_HOST) === false) {
    const filepath = await download(url);
    if (filepath) {
      doFix(new URL(path.relative(JSON_SCHEMA_ROOT, filepath), BASE_HOST).href);
      return true;
    }
  }
  return false;
};
export const doFetch = async () => {
  for (const schema of api.schemas) {
    let changed = false;
    changed =
      (await fixUrl(schema.url, (url) => (schema.url = url))) || changed;

    const versions: any = schema.versions;
    if (versions) {
      for (const version in versions) {
        changed =
          (await fixUrl(
            versions[version],
            (url) => (versions[version] = url)
          )) || changed;
      }
    }
    if (changed) {
      fs.writeFileSync(
        path.join(__dirname, "../src/catalog.json"),
        JSON.stringify(api, null, 2)
      );
    }
  }
};

if (require.main === module) {
  doFetch();
}
