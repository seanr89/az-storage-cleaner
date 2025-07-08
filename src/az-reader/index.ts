// src/index.ts or index.ts

import 'dotenv/config';
import { BlobServiceClient } from '@azure/storage-blob';
import { DateTime } from 'luxon';
import * as path from 'path'; // For path manipulation (joining, ensuring safety)
import * as fs from 'fs';   // For file system operations (creating directory)
import type { FileInfo } from './models/Fileinfo';
import { writeToJson, writeToCsv } from './file-writer';



/**
 * Main function to orchestrate the entire process.
 */
async function main() {
    const grouped = await listAndGroupContainerFiles();
    if (grouped) {
        await reorderAndSaveGroupedFiles(grouped);
    } else {
        console.error('Aborting file saving due to previous errors.');
    }
    console.log('\n🎉 Application finished!');
}

// Call the main function to start the process
main();


/**
 * Extracts the base name for grouping, removing common extensions like .js, .css, .gz, .map etc.
 */
function getGroupKey(filename: string): string {
    let key = filename;

    const firstDotIndex = key.indexOf('.');
    let firstPart = key.substring(0, firstDotIndex);
    return firstPart;
}

/**
 * Finds the earliest lastModified date within a group of files.
 * Returns undefined if no files or no valid dates are found.
 */
function findEarliestDateInGroup(files: FileInfo[]): Date | undefined {
    let earliestDate: Date | undefined = undefined;
    for (const file of files) {
        if (file.lastModified) {
            if (!earliestDate || file.lastModified.getTime() < earliestDate.getTime()) {
                earliestDate = file.lastModified;
            }
        }
    }
    return earliestDate;
}

/**
 * Lists and groups root-level blobs (files not in implied subdirectories) by their base name.
 * @returns A Map of grouped files or undefined if an error occurred.
 */
async function listAndGroupContainerFiles(): Promise<Map<string, FileInfo[]> | undefined> {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    let containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
    console.log(containerName);
    if(containerName === "web"){
        containerName = "$web"
    }

    if (!connectionString) {
        console.error('❌ Error: AZURE_STORAGE_CONNECTION_STRING is not set in your .env file.');
        return undefined;
    }
    if (!containerName) {
        console.error('❌ Error: AZURE_STORAGE_CONTAINER_NAME is not set in your .env file.');
        return undefined;
    }

    try {
        console.log(`\n📦 Connecting to Azure Storage account and listing ROOT-LEVEL files in container: '${containerName}'...`);

        if(containerName === "web" || containerName === "log"){
            containerName = "$" + containerName;
        }
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(containerName);

        const containerExists = await containerClient.exists();
        if (!containerExists) {
            console.error(`\n❌ Error: Container '${containerName}' does not exist or is not accessible.`);
            return undefined;
        }

        const groupedFiles = new Map<string, FileInfo[]>();
        let totalFilesConsidered = 0;
        let nestedFileCount = 0;

        console.log(`\n📄 Processing files in container '${containerName}'...`);

        for await (const blob of containerClient.listBlobsFlat()) {
            totalFilesConsidered++;

            // Skip files in nested "folders" (based on '/' in name)
            if (blob.name.includes('/')) {
                nestedFileCount++;
                continue;
            }

            const groupKey = getGroupKey(blob.name);
            const fileInfo: FileInfo = {
                name: blob.name,
                lastModified: blob.properties.lastModified
            };

            if (!groupedFiles.has(groupKey)) {
                groupedFiles.set(groupKey, []);
            }
            groupedFiles.get(groupKey)?.push(fileInfo);
        }

        console.log(`\n--- Initial Grouping Summary in '${containerName}' ---`);
        console.log(`Total unique groups found: ${groupedFiles.size}`);
        if (nestedFileCount > 0) {
            console.log(`(Skipped ${nestedFileCount} nested files out of ${totalFilesConsidered} total.)`);
        } else {
            console.log(`(No nested files were skipped out of ${totalFilesConsidered} total.)`);
        }
        console.log('\n✅ Initial grouping complete. Proceeding to reorder and save...');

        return groupedFiles;

    } catch (error) {
        console.error('\n❌ An unexpected error occurred during initial grouping:');
        if (error instanceof Error) {
            console.error(`Error message: ${error.message}`);
            if ('code' in error) {
                console.error(`Error code: ${(error as any).code}`);
            }
        } else {
            console.error(error);
        }
        console.error('Please ensure your connection string and container name are correct and you have network access to Azure Storage.');
        return undefined;
    }
}

/**
 * Reorders the grouped files by their earliest modified date and saves each group to a file.
 * @param groupedFiles The Map of grouped file information.
 */
async function reorderAndSaveGroupedFiles(groupedFiles: Map<string, FileInfo[]>) {
    const outputDir = './output';

    let earliestTotals: FileInfo[] = [];
    let alldata: FileInfo[] = [];

    try {
        // Ensure the output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`\n📂 Created output directory: ${outputDir}`);
        } else {
            console.log(`\n📂 Output directory already exists: ${outputDir}`);
        }

        // Convert Map to an array of [key, value] pairs for sorting
        const sortedGroupEntries = Array.from(groupedFiles.entries()).sort((a, b) => {
            const earliestA = findEarliestDateInGroup(a[1]);
            const earliestB = findEarliestDateInGroup(b[1]);

            // Handle cases where a group might not have a valid lastModified date
            // (e.g., if files were somehow added without this property, or filtered out)
            if (!earliestA && !earliestB) return 0; // Both undefined, treat as equal
            if (!earliestA) return 1; // A has no date, B does: A comes after B
            if (!earliestB) return -1; // B has no date, A does: B comes after A

            return earliestA.getTime() - earliestB.getTime(); // Sort by earliest date (ascending)
        });

        console.log(`\n--- Found ${sortedGroupEntries.length} groups to save ---`);
        console.log(`\n--- Saving Grouped Files (Sorted by Earliest Modification Date) ---`);

        let filesSavedCount = 0;
        for (const [groupKey, filesInGroup] of sortedGroupEntries) {
            if(filesInGroup.length < 3) {
                console.log(`\n--- Not enough files in group '${groupKey}' to save (found ${filesInGroup.length}) ---`);
                continue;
            }

            // create list of files in group and remove the last two records
            const filesToSave = filesInGroup.slice(0, -2); // Exclude the last two files
            if (filesToSave.length > 0) {
                // add top 2 files to earliestTotals
                earliestTotals.push(...filesInGroup.slice(0, -2));
            }

            // Sanitize groupKey for filename (replace potentially problematic characters if any, though getGroupKey makes it safe)
            const safeGroupKey = groupKey.replace(/[^a-zA-Z0-9-.]/g, '_'); // Replace non-alphanumeric, non-hyphen, non-dot with underscore
            const outputFilePath = path.join(outputDir, `${safeGroupKey}.txt`);

            let fileContent = `Group Name: ${groupKey}\n`;
            fileContent += `Earliest Modified: ${findEarliestDateInGroup(filesInGroup)
                ? DateTime.fromJSDate(findEarliestDateInGroup(filesInGroup)!).toFormat("yyyy-MM-dd HH:mm:ss ZZZZ")
                : 'N/A'}\n\n`;

            // Sort files within the group by name for consistent output in the file
            filesInGroup.sort((a, b) => a.name.localeCompare(b.name));

            for (const file of filesInGroup) {
                const lastModifiedDateTime = file.lastModified
                    ? DateTime.fromJSDate(file.lastModified).toFormat("yyyy-MM-dd HH:mm:ss ZZZZ") // Full timezone name
                    : 'N/A';
                fileContent += `- ${file.name} (Last Modified: ${lastModifiedDateTime})\n`;
            }
            fileContent += `\n--- End of Group ${groupKey} ---\n\n`;

            // 
            alldata.push(...filesInGroup);


            await Bun.write(outputFilePath, fileContent);
            console.log(`  📝 Saved: ${outputFilePath}`);
            filesSavedCount++;
        }

        if(alldata.length > 0){
            await writeToCsv(alldata, "alldata.csv");
            await writeToJson(alldata, "alldata.json");
        }

        console.log(`\n✅ Successfully saved ${filesSavedCount} group files to '${outputDir}'!`);

        // write earlierstTotals to a file
        await saveEarliestFileRecords(earliestTotals, outputDir);
    } catch (error) {
        console.error('\n❌ An unexpected error occurred while reordering or saving files:');
        if (error instanceof Error) {
            console.error(`Error message: ${error.message}`);
        } else {
            console.error(error);
        }
    }
}



async function saveEarliestFileRecords(earliestTotals: FileInfo[], outputDir: string) {
    if (earliestTotals.length > 0) {
        const earliestOutputFilePath = path.join(outputDir, 'earliest_totals.txt');
        let earliestContent = `Earliest Totals:\n\n`;

        earliestTotals.sort((a, b) => {
            if (!a.lastModified || !b.lastModified) return 0; // If either is undefined, treat as equal
            return a.lastModified.getTime() - b.lastModified.getTime(); // Sort by last modified date
        });

        for (const file of earliestTotals) {
            const lastModifiedDateTime = file.lastModified
                ? DateTime.fromJSDate(file.lastModified).toFormat("yyyy-MM-dd HH:mm:ss ZZZZ")
                : 'N/A';
            earliestContent += `- ${file.name} (Last Modified: ${lastModifiedDateTime})\n`;
        }

        await Bun.write(earliestOutputFilePath, earliestContent);
        console.log(`\n📝 Saved earliest totals to: ${earliestOutputFilePath}`);
    }
}