import { ReactNode } from 'react'
import Sidebar from './Sidebar'

interface Props {
    children: ReactNode
}

export default function Layout({ children }: Props) {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                {children}
            </main>
        </div>
    )
}
