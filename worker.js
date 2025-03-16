addEventListener('fetch', event => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const request = event.request;
  const env = event.env; // Securely access environment variables

  // ✅ Handle GET requests (so visiting the worker URL in a browser doesn't crash)
  if (request.method === 'GET') {
    return new Response("✅ Cloudflare Worker is running!", { status: 200 });
  }

  // ✅ Continue processing only POST requests from Discord
  if (request.method === 'POST') {
    return handleDiscordRequest(request, env);
  }

  return new Response("❌ Invalid request method", { status: 400 });
}

async function handleDiscordRequest(request, env) {
  const DISCORD_PUBLIC_KEY = env.DISCORD_PUBLIC_KEY;
  const CLICKUP_API_TOKEN = env.CLICKUP_API_TOKEN;
  const CLICKUP_LIST_ID = env.CLICKUP_LIST_ID;

  try {
    const signature = request.headers.get('X-Signature-Ed25519');
    const timestamp = request.headers.get('X-Signature-Timestamp');
    const body = await request.clone().text();

    // ✅ Validate the request signature from Discord
    const isValid = await verifyDiscordRequest(body, signature, timestamp, DISCORD_PUBLIC_KEY);
    if (!isValid) {
      console.warn("❌ Invalid request signature detected.");
      return new Response("Invalid request signature", { status: 401 });
    }

    const jsonBody = JSON.parse(body);

    // ✅ Handle Discord's Ping event (Discord uses this to verify the URL)
    if (jsonBody.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ✅ Handle `/task` command from Discord
    if (jsonBody.type === 2 && jsonBody.data.name === 'task') {
      const taskname = jsonBody.data.options[0].value;
      const taskdesc = jsonBody.data.options[1].value;

      console.log(`📌 Received task request: ${taskname}`);

      // Create the task in ClickUp
      const taskCreated = await createClickUpTask(taskname, taskdesc, CLICKUP_API_TOKEN, CLICKUP_LIST_ID, env);

      if (taskCreated) {
        console.log(`✅ Task "${taskname}" created successfully.`);
        return new Response(
          JSON.stringify({
            type: 4, // Respond with a message only visible to the user
            data: { content: `✅ Task "${taskname}" has been created!`, flags: 64 }
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        console.warn(`❌ Failed to create task: ${taskname}`);
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: `❌ Failed to create task "${taskname}".`, flags: 64 }
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  } catch (error) {
    console.error("🚨 Error processing request:", error);
    return new Response("❌ Internal Server Error", { status: 500 });
  }

  return new Response("❌ Invalid request", { status: 400 });
}

// ✅ Function to create a task in ClickUp
async function createClickUpTask(taskname, taskdesc, apiToken, listId, env) {
  const CLICKUP_ASSIGNEE = env.CLICKUP_ASSIGNEE || null; // Fetch ClickUp assignee if available
  const url = `https://api.clickup.com/api/v2/list/${listId}/task`;

  const data = {
    name: taskname,
    description: taskdesc,
    assignees: CLICKUP_ASSIGNEE ? [CLICKUP_ASSIGNEE] : [], // Assign only if available
  };

  console.log(`📤 Creating ClickUp task: ${taskname}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiToken,
    },
    body: JSON.stringify(data),
  });

  if (response.ok) {
    const responseData = await response.json();
    return responseData.url; // Return task URL if created successfully
  }

  console.error(`❌ ClickUp API request failed with status: ${response.status}`);
  return false;
}

// ✅ Verifying Discord's request signature
async function verifyDiscordRequest(body, signature, timestamp, publicKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(timestamp + body);
  
  const signatureArray = hexToUint8Array(signature);

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      hexToUint8Array(publicKey),
      { name: 'Ed25519', public: true }, // ✅ Fixed incorrect algorithm
      true,
      ['verify']
    );

    return crypto.subtle.verify('Ed25519', key, signatureArray, data);
  } catch (error) {
    console.error("🚨 Signature verification failed:", error);
    return false;
  }
}

// ✅ Helper function to convert hex to Uint8Array
function hexToUint8Array(hexString) {
  const matches = hexString.match(/.{1,2}/g);
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}
