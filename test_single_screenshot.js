import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function run() {
    console.log("🚀 Starting isolated screenshot test...");

    const transport = new StdioClientTransport({
        command: "node",
        args: ["bundle/index.js"]
    });

    const client = new Client({
        name: "test-client",
        version: "1.0.0"
    }, {
        capabilities: {}
    });

    try {
        await client.connect(transport);
        console.log("✅ Connected to MCP server.");

        console.log("📸 Requesting screenshot...");
        const start = Date.now();

        const result = await client.callTool({
            name: "screenshot",
            arguments: {}
        });

        const duration = Date.now() - start;
        console.log(`⏱️ Request completed in ${duration}ms`);

        if (result.content && result.content[0]?.text) {
            const rawText = result.content[0].text;
            try {
                // 解析返回的 JSON 对象
                const data = JSON.parse(rawText);
                if (data.base64 && data.base64.startsWith("data:image/jpeg;base64,")) {
                    console.log("🎉 SUCCESS: Received valid Base64 JPEG data!");
                    console.log(`   Image dimensions: ${data.width}x${data.height}`);
                    console.log(`   Base64 length: ${data.base64.length} characters`);
                } else {
                    console.log("❌ ERROR: Base64 field missing or invalid.");
                    console.log("Parsed data:", data);
                }
            } catch (e) {
                console.log("❌ ERROR: Failed to parse JSON response.");
                console.log("Raw text preview:", rawText.substring(0, 200));
            }
        } else {
            console.log("❌ ERROR: No content returned in the tool response.");
            console.log("Full response:", JSON.stringify(result, null, 2));
        }

    } catch (error) {
        console.error("❌ TEST FAILED!");
        console.error("Error Type:", error.constructor.name);
        console.error("Error Message:", error.message);

        if (error.message.includes("Timeout") || error.message.includes("ETIMEDOUT")) {
            console.error("💡 Diagnosis: The server is taking too long to respond (Timeout).");
        }
    } finally {
        await client.close();
        console.log("🏁 Test finished.");
    }
}

run();