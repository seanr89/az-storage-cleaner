// src/index.ts or index.ts

// Import dotenv config to load environment variables from .env file
import 'dotenv/config';
import { BlobServiceClient } from '@azure/storage-blob';

/**
 * Lists all blobs (files) in a specified Azure Storage container.
 */
async function listContainerFiles() {
    // Retrieve connection string and container name from environment variables
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

    // --- Input Validation ---
    if (!connectionString) {
        console.error('❌ Error: AZURE_STORAGE_CONNECTION_STRING is not set in your .env file.');
        console.error('Please get it from your Azure Storage Account -> Access keys.');
        return;
    }
    if (!containerName) {
        console.error('❌ Error: AZURE_STORAGE_CONTAINER_NAME is not set in your .env file.');
        console.error('Please set it to the name of the container you want to list files from.');
        return;
    }

    try {
        console.log(`\n📦 Connecting to Azure Storage account and listing files in container: '${containerName}'...`);

        // Create the BlobServiceClient object which will be used to create a container client
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

        // Get a reference to a container client
        const containerClient = blobServiceClient.getContainerClient(containerName);

        // --- Check if container exists ---
        const containerExists = await containerClient.exists();
        if (!containerExists) {
            console.error(`\n❌ Error: Container '${containerName}' does not exist or is not accessible with the provided credentials.`);
            console.error('Please double-check the container name and your connection string.');
            return;
        }

        console.log(`\n📄 Files found in container '${containerName}':`);
        let fileCount = 0;

        // Use listBlobsFlat() to get a flat list of all blobs (including those in virtual directories)
        // This returns an async iterable, so we use 'for await...of'
        for await (const blob of containerClient.listBlobsFlat()) {
            console.log(`- ${blob.name}`);
            fileCount++;
            // You can access more properties like:
            // console.log(`  Size: ${blob.properties.contentLength} bytes`);
            // console.log(`  Last Modified: ${blob.properties.lastModified}`);
        }

        if (fileCount === 0) {
            console.log(`(No files found in container '${containerName}')`);
        } else {
            console.log(`\n✅ Total files listed: ${fileCount}`);
        }

        console.log('\n🎉 File listing complete!');

    } catch (error) {
        console.error('\n❌ An unexpected error occurred while connecting to Azure Storage or listing files:');
        if (error instanceof Error) {
            console.error(`Error message: ${error.message}`);
            // Azure SDK errors often have additional properties like `code` or `details`
            if ('code' in error) {
                console.error(`Error code: ${(error as any).code}`);
            }
        } else {
            console.error(error); // Log the raw error if it's not an Error object
        }
        console.error('Please ensure your connection string and container name are correct and you have network access to Azure Storage.');
    }
}

// Call the main function to start the process
listContainerFiles();