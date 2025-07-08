
export async function removeAzFilesFromContainer(
    containerName: string,
    azFiles: string[],
    blobServiceClient: any
    ): Promise<void> {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    for (const file of azFiles) {
        const blobClient = containerClient.getBlobClient(file);
        try {
        await blobClient.delete();
        console.log(`Deleted file: ${file}`);
        } catch (error) {
        console.error(`Error deleting file ${file}:`, error);
        }
    }
}