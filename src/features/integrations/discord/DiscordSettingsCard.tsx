import { useEffect, useState } from 'react';
import { MessageSquare, ExternalLink, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useDiscordIntegration } from './useDiscordIntegration';

export function DiscordSettingsCard() {
  const { integration, loading, save, disconnect } = useDiscordIntegration();
  const [webhook, setWebhook] = useState('');
  const [serverName, setServerName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [autoAnnounce, setAutoAnnounce] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (integration) {
      setWebhook(integration.webhook_url);
      setServerName(integration.server_name ?? '');
      setRoleId(integration.role_to_ping ?? '');
      setAutoAnnounce(integration.auto_announce);
    }
  }, [integration]);

  const canSave =
    webhook.trim().startsWith('https://discord.com/api/webhooks/') ||
    webhook.trim().startsWith('https://discordapp.com/api/webhooks/');

  const handleSave = async () => {
    setSaving(true);
    await save({
      webhook_url: webhook.trim(),
      server_name: serverName.trim() || null,
      role_to_ping: roleId.trim() || null,
      auto_announce: autoAnnounce,
    });
    setSaving(false);
  };

  return (
    <section className="bg-card/50 rounded-2xl p-4 landscape:p-3 border border-border/30 animate-slide-up">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Discord Integration</p>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Connect a Discord server so BlackTop can ping it when you start a convoy or trigger a rescue alert.
        Paste a channel webhook URL from your Discord server settings.
      </p>

      <a
        href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline mb-3"
      >
        How to create a webhook <ExternalLink className="w-3 h-3" />
      </a>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Webhook URL</label>
          <Input
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="mt-1 h-10 rounded-xl text-xs"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Server name (optional)</label>
          <Input
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            placeholder="My Riders"
            className="mt-1 h-10 rounded-xl text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Role ID to ping (optional)</label>
          <Input
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            placeholder="123456789012345678"
            className="mt-1 h-10 rounded-xl text-xs font-mono"
            inputMode="numeric"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Enable Developer Mode in Discord, right-click a role, "Copy Role ID".
          </p>
        </div>
        <div className="flex items-center justify-between pt-2">
          <div>
            <p className="text-sm font-medium">Auto-announce convoys</p>
            <p className="text-[10px] text-muted-foreground">Ping the server every time you start a convoy</p>
          </div>
          <Switch checked={autoAnnounce} onCheckedChange={setAutoAnnounce} />
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={!canSave || saving || loading}
            className="flex-1 h-10 rounded-xl"
          >
            {integration ? 'Update' : 'Connect'}
          </Button>
          {integration && (
            <Button
              onClick={disconnect}
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl"
              title="Disconnect"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
