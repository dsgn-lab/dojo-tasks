addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const DISCORD_PUBLIC_KEY = globalThis.c101498f92c7864001f56650a3fdf5921174f5d83cfc338851b200cfe809f414;
  const CLICKUP_API_TOKEN  = globalThis.pk_270854689_92TRB3RV1TYN1E663F1KXZSTI61AVMIH;
  const CLICKUP_LIST_ID    = globalThis.901605328722;

  if (request.method === 'POST') {
    const signature = request.headers.get('X-Signature-Ed25519');
    const timestamp = request.headers.get('X-Signature-Timestamp');
    const body = await request.clone().text();
    
    // Validate the request signature from Discord
    const isValid = await verifyDiscordRequest(body, signature, timestamp, DISCORD_PUBLIC_KEY);
    if (!isValid) {
      return new Response('Invalid request signature', { status: 401 });
    }

    const jsonBody = JSON.parse(body);

    // Handle Discord's Ping event
    if (jsonBody.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Handle /task command interaction
    if (jsonBody.type === 2 && jsonBody.data.name === 'task') {
      const taskname = jsonBody.data.options[0].value;
      const taskdesc = jsonBody.data.options[1].value;

      // Create the task in ClickUp
      const taskCreated = await createClickUpTask(taskname, taskdesc, CLICKUP_API_TOKEN, CLICKUP_LIST_ID);

      if (taskCreated) {
        return new Response(
          JSON.stringify({
            type: 4, // Respond with a message only visible to the user
            data: { content: `Task "${taskname}" has been created!`, flags: 64 }
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: `Failed to create task "${taskname}".`, flags: 64 }
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  }

  return new Response('Invalid request', { status: 400 });
}

// Function to create a task in ClickUp
async function createClickUpTask(taskname, taskdesc, apiToken, listId) {
  const CLICKUP_LIST_ID = globalThis.CLICKUP_ASSIGNEE;
  const url             = `https://api.clickup.com/api/v2/list/${listId}/task`;

  const data = {
    name: taskname,
    description: taskdesc,
    assignees: [CLICKUP_LIST_ID],
  };

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
    return responseData.url; // Return task URL or any confirmation that the task was created
  }

  return false;
}

// Verifying Discord's request signature
async function verifyDiscordRequest(body, signature, timestamp, publicKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(timestamp + body);
  
  const signatureArray = hexToUint8Array(signature);

  const key = await crypto.subtle.importKey(
    'raw',
    hexToUint8Array(publicKey),
    { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519', public: true },
    true,
    ['verify']
  );

  return crypto.subtle.verify('NODE-ED25519', key, signatureArray, data);
}

// Helper function to convert hex to Uint8Array
function hexToUint8Array(hexString) {
  const matches = hexString.match(/.{1,2}/g);
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}
