const fs = require("fs");
const fetch = require("node-fetch");
const { HttpsProxyAgent } = require("https-proxy-agent");
const chalk = require("chalk");
const delay = require("delay");
const url = "https://api.cspr.community/api";
const queryFilePath = "auth.txt";
const proxy = "proxy.txt";

function log(msg, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  switch (type) {
    case "success":
      console.log(`[${timestamp}] ➤  ${chalk.green(msg)}`);
      break;
    case "custom":
      console.log(`[${timestamp}] ➤  ${chalk.magenta(msg)}`);
      break;
    case "error":
      console.log(`[${timestamp}] ➤  ${chalk.red(msg)}`);
      break;
    case "warning":
      console.log(`[${timestamp}] ➤  ${chalk.yellow(msg)}`);
      break;
    default:
      console.log(`[${timestamp}] ➤  ${msg}`);
  }
}
function readQueryIdsFromFile() {
  try {
    const queryContent = fs.readFileSync(queryFilePath, "utf-8");
    return queryContent
      .split("\n")
      .map((query) => query.trim())
      .filter((query) => query); // Ensure to remove extra newlines or spaces
  } catch (error) {
    console.error(chalk.red(`Error reading ${queryFilePath}:`), error);
    return [];
  }
}
async function makeRequest(url, body = null, headers = {}, proxy = null) {
  return new Promise((resolve, reject) => {
    // Tentukan opsi untuk fetch
    const options = {
      method: body ? "POST" : "GET",
      headers: {
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9",
        "content-type": "application/json",
        origin: "https://webapp.cspr.community",
        priority: "u=1, i",
        referer: "https://webapp.cspr.community/",
        "sec-ch-ua":
          '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        ...headers,
      },
      body: body ? body : undefined,
    };

    // Jika proxy disediakan, atur agent
    if (proxy) {
      options.agent = new HttpsProxyAgent(proxy);
    }

    fetch(url, options)
      .then((response) => {
        // Validasi status response
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => resolve(data)) // Resolving the promise with data
      .catch((error) => {
        reject(error); // Rejecting the promise with error
      });
  });
}
async function processChunkedData(queryIds, chunkSize = 20) {
  for (let i = 0; i < queryIds.length; i += chunkSize) {
    const queryContent = fs.readFileSync(proxy, "utf-8");
    const proxynew = queryContent ? queryContent : null;
    const chunk = queryIds.slice(i, i + chunkSize); // Ambil chunk data dengan batasan 20 item
    const promises = chunk.map(async (query, index) => {
      try {
        const getUser = await makeRequest(
          url + "/users/me",
          null,
          { authorization: `Bearer ${query}` },
          proxynew
        );
        if (getUser.user) {
          log(`➤ user id  : ${getUser.user.id}`, "custom");
          log(`➤ username : ${getUser.user.username}`, "custom");
          log(`➤ point    : ${getUser.points}`, "custom");
          log(`➤ wallet   : ${getUser.wallet}`, "custom");
          const taskCheck = await makeRequest(
            url + "/users/me/tasks",
            null,
            { authorization: `Bearer ${query}` },
            proxynew
          );

          const priorityTasks = Object.values(taskCheck.tasks).reduce(
            (acc, tasks) => {
              return acc.concat(tasks.filter((task) => task));
            },
            []
          );
          while (true) {
            await Promise.all(
              priorityTasks.map(async (task_id) => {
                try {
                  const currentDate = new Date();
                  const gettask = await makeRequest(
                    url + "/users/me/tasks",
                    JSON.stringify({
                      task_name: task_id.task_name,
                      action: 0,
                      data: { date: currentDate.toISOString().toString() },
                    }),
                    { authorization: `Bearer ${query}` },
                    proxynew
                  );

                  log(
                    `➤ claim task  wait ${gettask.task.seconds_to_allow_claim} sec.....`,
                    "success"
                  );
                  await delay(gettask.task.seconds_to_allow_claim * 1000);
                  const claimTask = await makeRequest(
                    url + "/users/me/tasks",
                    JSON.stringify({
                      task_name: task_id.task_name,
                      action: 1,
                      data: { date: currentDate.toISOString() },
                    }),
                    { authorization: `Bearer ${query}` },
                    proxynew
                  );

                  if (claimTask.balances[0].balance > 0) {
                    log(
                      `➤ claim task  ${task_id.title} ${claimTask.balances[0].balance}+`,
                      "success"
                    );
                  } else {
                    log(`➤ claim task failed !!`, "error");
                  }
                } catch (error) {
                  log(`➤ claim task failed !!`, "error");
                }
              })
            );
          }
        } else {
          log(`➤ fetch user failed !!`, "error");
        }
      } catch (error) {
        log(`failed proses akun ke [${index}] ${error.toString()}`, "error");
      }
    });

    await Promise.all(promises); // Tunggu sampai semua promise dalam chunk selesai
    log(chalk.blue(`Chunk ${i / chunkSize + 1} completed.`));
    await delay(5000); // Delay 5 detik sebelum memproses chunk berikutnya (opsional)
  }
}
(async () => {
  const queryIds = readQueryIdsFromFile();
  if (queryIds.length === 0) {
    console.error(chalk.red("No query_ids found in query.txt"));
    return;
  }

  while (true) {
    await processChunkedData(queryIds, 20);
    log(`➤ Processing Account Couldown 10 menit !!`, "warning");
    await delay(1000 * 10);
  }
})();
