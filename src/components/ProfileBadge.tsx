import './ProfileBadge.css';

interface ProfileBadgeProps {
  accountName: string;
  showAccountName?: boolean;
}

export function ProfileBadge({ accountName, showAccountName = false }: ProfileBadgeProps) {
  const initials = accountName.trim().split(/\s+/).map(word => word[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="profile-badge" title={accountName}>
      <span className="profile-icon" role="img" aria-label={accountName}>{initials}</span>
      {showAccountName && <span className="profile-account-name" aria-hidden="true">{accountName}</span>}
    </div>
  );
}
