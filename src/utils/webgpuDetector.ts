/**
 * WebGPU Browser Compatibility Detector
 *
 * Checks if the current browser supports WebGPU API.
 * WebGPU is supported in:
 * - Chrome/Edge 113+
 * - Firefox 133+ (experimental, requires flag)
 * - Safari 18+ (partial support)
 */

export interface WebGPUDetectionResult {
    supported: boolean;
    message: string;
    browserInfo?: {
        name: string;
        version: string;
    };
}

/**
 * Detects WebGPU support in the current browser
 * @returns Promise with detection result
 */
export async function detectWebGPU(): Promise<WebGPUDetectionResult> {
    // Check if navigator.gpu exists
    if (!navigator.gpu) {
        return {
            supported: false,
            message: 'WebGPU is not supported in this browser. Please use Chrome 113+, Edge 113+, or Safari 18+.',
        };
    }

    try {
        // Try to request an adapter
        const adapter = await navigator.gpu.requestAdapter();

        if (!adapter) {
            return {
                supported: false,
                message: 'WebGPU adapter could not be requested. Your GPU may not support WebGPU.',
            };
        }

        // Success!
        return {
            supported: true,
            message: 'WebGPU is fully supported and ready to use!',
            browserInfo: getBrowserInfo(),
        };
    } catch (error) {
        return {
            supported: false,
            message: `WebGPU initialization error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}

/**
 * Gets basic browser information
 * @returns Browser name and version
 */
function getBrowserInfo(): { name: string; version: string } {
    const userAgent = navigator.userAgent;
    let browserName = 'Unknown';
    let browserVersion = 'Unknown';

    // Chrome/Chromium
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
        browserName = 'Chrome';
        const match = userAgent.match(/Chrome\/(\d+)/);
        browserVersion = match ? match[1] : 'Unknown';
    }
    // Edge
    else if (userAgent.includes('Edg')) {
        browserName = 'Edge';
        const match = userAgent.match(/Edg\/(\d+)/);
        browserVersion = match ? match[1] : 'Unknown';
    }
    // Firefox
    else if (userAgent.includes('Firefox')) {
        browserName = 'Firefox';
        const match = userAgent.match(/Firefox\/(\d+)/);
        browserVersion = match ? match[1] : 'Unknown';
    }
    // Safari
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
        browserName = 'Safari';
        const match = userAgent.match(/Version\/(\d+)/);
        browserVersion = match ? match[1] : 'Unknown';
    }

    return { name: browserName, version: browserVersion };
}

/**
 * Checks if browser meets minimum version requirements for WebGPU
 * @returns True if browser version is sufficient
 */
export function meetsMinimumRequirements(): boolean {
    const { name, version } = getBrowserInfo();
    const versionNum = parseInt(version, 10);

    switch (name) {
        case 'Chrome':
        case 'Edge':
            return versionNum >= 113;
        case 'Firefox':
            return versionNum >= 133; // Experimental support
        case 'Safari':
            return versionNum >= 18; // Partial support
        default:
            return false;
    }
}
