import Memberships from './Memberships';
import ActiveMembers from '../components/ActiveMembers';
export default function MembershipsPage() {
  return (
    <div className="space-y-8">
      <Memberships />
      <ActiveMembers />
    </div>
  );
}
