import { redirect } from 'react-router';
import { sesi } from '../lib/sesi';

export function clientLoader() {
  return redirect(`/${sesi.mode()}`);
}

export default function Index() {
  return null;
}
