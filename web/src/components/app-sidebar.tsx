import { EllipsisVertical, LogOut, Settings2, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import type { Quota } from '@/api'

import type { Page } from '@/lib/navigation'
export type PrintlePage = Page

export type NavIconName = 'queue' | 'profile' | 'printer' | 'users' | 'reports' | 'users-reports' | 'settings'

export type SidebarNavItem = {
  page: PrintlePage
  title: string
  icon: NavIconName
}

export type SidebarNavGroup = {
  label: string
  items: SidebarNavItem[]
}

type AppSidebarProps = {
  groups: SidebarNavGroup[]
  page: PrintlePage
  onNavigate: (page: PrintlePage) => void
  user: { displayName: string; email: string }
  quota?: Quota
  onProfile: () => void
  onSettings: () => void
  onSignOut: () => void
  themeControl?: ReactNode
  renderIcon: (name: NavIconName) => ReactNode
  brandMark: ReactNode
}

function QuotaBar({ quota }: { quota: Quota }) {
  const used = quota.used + quota.pending
  const pct = quota.exempt || quota.limit <= 0 ? 0 : Math.min(100, Math.round((used / quota.limit) * 100))
  return <div className="grid gap-1.5 px-1 pt-2">
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">Quota</span>
      <span className="font-medium tabular-nums">{quota.exempt ? 'Unlimited' : `${used} / ${quota.limit}`}</span>
    </div>
    <Progress value={quota.exempt ? 0 : pct} aria-label="Quota used" />
  </div>
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function NavMain({
  groups,
  page,
  onNavigate,
  renderIcon,
}: {
  groups: SidebarNavGroup[]
  page: PrintlePage
  onNavigate: (page: PrintlePage) => void
  renderIcon: (name: NavIconName) => ReactNode
}) {
  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.page}>
                  <SidebarMenuButton
                    type="button"
                    isActive={page === item.page}
                    tooltip={item.title}
                    onClick={() => onNavigate(item.page)}
                  >
                    <span className="printle-nav-icon" aria-hidden="true">
                      {renderIcon(item.icon)}
                    </span>
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}

function NavUser({
  user,
  quota,
  onProfile,
  onSettings,
  onSignOut,
}: {
  user: { displayName: string; email: string }
  quota?: Quota
  onProfile: () => void
  onSettings: () => void
  onSignOut: () => void
}) {
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              type="button"
              size="lg"
              aria-label="Account menu"
            >
              <Avatar shape="square">
                <AvatarFallback tone="brand" shape="square">
                  {initials(user.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <EllipsisVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar shape="square">
                  <AvatarFallback tone="brand" shape="square">
                    {initials(user.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
              {quota && <QuotaBar quota={quota} />}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onProfile}>
              <UserRound className="size-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSettings}>
              <Settings2 className="size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut}>
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function AppSidebarBody({
  groups,
  page,
  onNavigate,
  user,
  quota,
  onProfile,
  onSettings,
  onSignOut,
  themeControl,
  renderIcon,
  brandMark,
}: AppSidebarProps) {
  return (
    <>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              type="button"
              size="lg"
              className="printle-brand-button"
              onClick={() => onNavigate('queue')}
              aria-label="printLe home"
            >
              <img className="brand-logo h-7 w-auto" src="/printle-logo.svg" alt="printLe" />
              <span className="brand-mark" aria-hidden="true">
                {brandMark}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={groups} page={page} onNavigate={onNavigate} renderIcon={renderIcon} />
      </SidebarContent>
      <SidebarFooter>
        {themeControl ? <div className="px-2 pb-1">{themeControl}</div> : null}
        <NavUser user={user} quota={quota} onProfile={onProfile} onSettings={onSettings} onSignOut={onSignOut} />
      </SidebarFooter>
    </>
  )
}
