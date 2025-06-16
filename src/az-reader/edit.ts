let containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
    console.log(containerName);
    if(containerName === "web"){
        containerName = "$web"
    }


/**
 * Extracts the base name for grouping, removing common extensions like .js, .css, .gz, .map etc.
 * For example:
 * - "main.0c00150a9fdeef81.js" becomes "main.0c00150a9fdeef81"
 * - "main.0c00150a9fdeef81.js.gz" also becomes "main.0c00150a9fdeef81"
 * - "mandalorian-2.9ca042c6b6ea5959.jpg" becomes "mandalorian-2.9ca042c6b6ea5959"
 */
function getGroupKey(filename: string): string {
    let key = filename;

    const firstDotIndex = key.indexOf('.');
    let firstPart = key.substring(0, firstDotIndex);
    return firstPart;
}
