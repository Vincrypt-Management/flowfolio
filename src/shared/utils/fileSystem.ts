import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';

/**
 * Platform-agnostic file saving utility
 * Handles Web (browser download) and Tauri (filesystem write)
 */
export async function saveFile(
  content: string | Uint8Array,
  filename: string,
  mimeType: string = 'application/json'
): Promise<void> {
  // Check if running in Tauri environment
  // We can check if window.__TAURI__ exists or try to use the plugin
  const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__;

  if (isTauri) {
    try {
      // For text content
      if (typeof content === 'string') {
        // Try to save to document directory first without dialog on mobile? 
        // Or use save dialog (which might fail on mobile if not implemented natively)
        
        // Strategy: Try save dialog first. If it fails, fallback to direct write to Downloads/Documents
        try {
          const path = await save({
            defaultPath: filename,
            filters: [{
              name: 'File',
              extensions: [filename.split('.').pop() || 'txt']
            }]
          });
          
          if (path) {
            await writeTextFile(path, content);
            return;
          } else {
            // User cancelled
            return;
          }
        } catch (dialogError) {
          // Dialog might not be supported on this platform/version
          console.warn('Save dialog failed, trying direct write:', dialogError);
          
          // Fallback to Downloads folder
          await writeTextFile(filename, content, { baseDir: BaseDirectory.Download });
          alert(`File saved to Downloads: ${filename}`);
          return;
        }
      } else {
        // Binary content
        try {
          const path = await save({
            defaultPath: filename,
            filters: [{
              name: 'File',
              extensions: [filename.split('.').pop() || 'bin']
            }]
          });
          
          if (path) {
            await writeFile(path, content);
            return;
          }
        } catch (dialogError) {
          console.warn('Save dialog failed, trying direct write:', dialogError);
          await writeFile(filename, content, { baseDir: BaseDirectory.Download });
          alert(`File saved to Downloads: ${filename}`);
          return;
        }
      }
    } catch (fsError) {
      console.error('Tauri FS save failed:', fsError);
      // Fallback to browser method if Tauri FS fails
    }
  }

  // Web / Browser Fallback (also works in some WebViews)
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
