import { systemPreferences } from 'electron'

export function checkAccessibilityPermission(): boolean {
  return systemPreferences.isTrustedAccessibilityClient(false)
}

export function requestAccessibilityPermission(): void {
  // Passing true prompts the user to open System Preferences
  systemPreferences.isTrustedAccessibilityClient(true)
}
