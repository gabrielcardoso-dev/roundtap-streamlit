import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.roundtap.mobile',
  appName: 'RoundTap',
  webDir: 'dist',
  backgroundColor: '#030604',
  ios: { contentInset: 'automatic' },
  android: { backgroundColor: '#030604' }
}

export default config
