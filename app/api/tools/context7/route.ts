import { NextResponse } from "next/server";

/**
 * Context7 tool proxy for the coding agent
 * Allows the agent to fetch up-to-date documentation
 */

// Interface for Context7 resolve request
interface ResolveLibraryRequest {
  tool: "resolve-library-id";
  libraryName: string;
}

// Interface for Context7 docs request
interface GetDocsRequest {
  tool: "get-library-docs";
  context7CompatibleLibraryID: string;
  topic?: string;
  mode?: "code" | "info";
}

type Context7Request = ResolveLibraryRequest | GetDocsRequest;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Context7Request;

    console.log(`[Context7 Tool] Received ${body.tool} request`);

    if (body.tool === "resolve-library-id") {
      // Search for library ID using Context7's llms.txt format
      // Context7 libraries are accessible at context7.com/<org>/<project>/llms.txt
      // For searching, we'll use a simple heuristic to construct likely library IDs

      const libraryName = body.libraryName.toLowerCase();

      // Common npm package to Context7 ID mappings
      const commonMappings: Record<string, string> = {
        "express": "/expressjs/express",
        "react": "/facebook/react",
        "next.js": "/vercel/next.js",
        "mongodb": "/mongodb/node-mongodb-native",
        "mongoose": "/automattic/mongoose",
        "nodemailer": "/nodemailer/nodemailer",
        "axios": "/axios/axios",
        "prisma": "/prisma/prisma",
        "@sipgate/ai-flow-sdk": "/sipgate/ai-flow-sdk",
      };

      // Try direct mapping first
      if (commonMappings[libraryName]) {
        const libraryId = commonMappings[libraryName];

        // Verify it exists by trying to fetch llms.txt
        try {
          const verifyResponse = await fetch(
            `https://context7.com${libraryId}/llms.txt`,
            { method: "HEAD" }
          );

          if (verifyResponse.ok) {
            console.log(`[Context7 Tool] Found library: ${libraryId}`);
            return NextResponse.json({
              libraryId: libraryId,
              name: body.libraryName,
              description: `Documentation for ${body.libraryName}`,
            });
          }
        } catch (e) {
          // Continue to fallback
        }
      }

      // Try common patterns: /<package-name>/<package-name>
      const simpleId = `/${libraryName}/${libraryName}`;
      try {
        const verifyResponse = await fetch(
          `https://context7.com${simpleId}/llms.txt`,
          { method: "HEAD" }
        );

        if (verifyResponse.ok) {
          console.log(`[Context7 Tool] Found library: ${simpleId}`);
          return NextResponse.json({
            libraryId: simpleId,
            name: body.libraryName,
            description: `Documentation for ${body.libraryName}`,
          });
        }
      } catch (e) {
        // Library not found
      }

      console.log(`[Context7 Tool] Library not found: ${body.libraryName}`);
      return NextResponse.json(
        {
          error: `No documentation found for "${body.libraryName}". Try using a well-known package with Context7 support, or provide the full Context7 library ID (format: /org/project).`
        },
        { status: 404 }
      );

    } else if (body.tool === "get-library-docs") {
      // Fetch documentation from Context7's llms.txt
      const libraryId = body.context7CompatibleLibraryID;

      if (!libraryId.startsWith("/")) {
        return NextResponse.json(
          { error: "Library ID must start with / (format: /org/project)" },
          { status: 400 }
        );
      }

      try {
        const docsResponse = await fetch(
          `https://context7.com${libraryId}/llms.txt`
        );

        if (!docsResponse.ok) {
          return NextResponse.json(
            { error: `Documentation not found for ${libraryId}` },
            { status: 404 }
          );
        }

        const docsText = await docsResponse.text();
        console.log(`[Context7 Tool] Retrieved docs for ${libraryId} (${docsText.length} chars)`);

        // Filter by topic if provided
        let filteredDocs = docsText;
        if (body.topic) {
          // Simple topic filtering - find sections containing the topic
          const lines = docsText.split("\n");
          const relevantSections: string[] = [];
          let currentSection: string[] = [];
          let inRelevantSection = false;

          for (const line of lines) {
            // Section headers typically start with # or are Source: lines
            if (line.startsWith("#") || line.startsWith("Source:")) {
              // Save previous section if it was relevant
              if (inRelevantSection && currentSection.length > 0) {
                relevantSections.push(currentSection.join("\n"));
              }

              // Check if new section is relevant
              inRelevantSection = line.toLowerCase().includes(body.topic.toLowerCase());
              currentSection = [line];
            } else {
              currentSection.push(line);
              // Also check content for topic
              if (line.toLowerCase().includes(body.topic.toLowerCase())) {
                inRelevantSection = true;
              }
            }
          }

          // Add final section if relevant
          if (inRelevantSection && currentSection.length > 0) {
            relevantSections.push(currentSection.join("\n"));
          }

          if (relevantSections.length > 0) {
            filteredDocs = relevantSections.join("\n\n---\n\n");
          }
        }

        return NextResponse.json({
          documentation: filteredDocs,
          source: `https://context7.com${libraryId}`,
        });
      } catch (error) {
        console.error(`[Context7 Tool] Fetch error:`, error);
        return NextResponse.json(
          { error: `Failed to fetch documentation: ${error instanceof Error ? error.message : String(error)}` },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Unknown tool" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("[Context7 Tool] Error:", error);
    return NextResponse.json(
      {
        error: `Context7 tool error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 500 }
    );
  }
}
