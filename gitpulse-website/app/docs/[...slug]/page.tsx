import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ALL_COMMANDS, getCommand } from '@/lib/commands';
import { DocsPage } from '@/components/DocsPage';

export async function generateStaticParams() {
  return ALL_COMMANDS.map((cmd) => ({
    slug: cmd.name.replace('run-schedule', 'run/schedule').split('/'),
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = resolvedParams.slug.join('/');
  const cmdName = slug.replace('run/schedule', 'run-schedule');
  const cmd = getCommand(cmdName);

  if (!cmd) {
    return { title: 'Not Found' };
  }

  return {
    title: `gitpulse ${cmd.name}`,
    description: cmd.description,
    openGraph: {
      title: `gitpulse ${cmd.name} | GitPulse Docs`,
      description: cmd.description,
    },
  };
}

export default async function DocsPageRoute({ params }: { params: Promise<{ slug: string[] }> }) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug.join('/');
  const cmdName = slug.replace('run/schedule', 'run-schedule');
  const cmd = getCommand(cmdName);

  if (!cmd) {
    notFound();
  }

  return <DocsPage command={cmd} />;
}