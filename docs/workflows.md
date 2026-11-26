# Database and user workflows

```mermaid
erDiagram
    auth_users ||--|| profiles : identifies
    profiles ||--o| student_profiles : extends
    profiles ||--o| librarian_profiles : extends
    categories ||--o{ books : classifies
    publishers o|--o{ books : publishes
    books ||--o{ book_authors : has
    authors ||--o{ book_authors : writes
    books ||--o{ book_copies : contains
    student_profiles ||--o{ borrow_transactions : borrows
    book_copies ||--o{ borrow_transactions : records
    student_profiles ||--o{ reservations : requests
    books ||--o{ reservations : queues
    book_copies o|--o{ reservations : allocates
    reservations o|--o| borrow_transactions : fulfills
    profiles ||--o{ notifications : receives
    profiles o|--o{ audit_logs : performs
    profiles ||--o{ idempotency_requests : submits
    librarian_profiles o|--o{ library_settings : updates
```

```mermaid
flowchart TD
    signIn["Sign in through Supabase Auth"] --> api["Express verifies token and active profile"]
    api --> role{"Role?"}
    role -->|Student| student["Student dashboard"]
    role -->|Librarian| admin["Librarian dashboard"]
    student --> catalog["Search and filter catalog"]
    catalog --> availability{"Copy available?"}
    availability -->|Yes| checkout["Validate eligibility and atomically create loan"]
    availability -->|No| reserve["Join FIFO waiting list"]
    reserve --> waiting["Track position or cancel"]
    admin --> manage["Manage collection, copies, students and policies"]
    admin --> circulation["Process checkouts and returns"]
    admin --> reports["Review reports and audit log"]
```

```mermaid
flowchart TD
    returned["Librarian processes return"] --> transaction["Close loan, record condition and audit"]
    transaction --> usable{"Copy usable?"}
    usable -->|No| removed["Keep damaged or lost copy unavailable"]
    usable -->|Yes| queue{"Eligible waiting reader?"}
    queue -->|No| shelf["Make copy available"]
    queue -->|Yes| ready["Reserve copy for oldest eligible request"]
    ready --> notify["Set deadline and notify student"]
    notify --> pickup{"Collected before deadline?"}
    pickup -->|Yes| borrow["Revalidate student and create loan"]
    pickup -->|No| expire["Expire hold and release allocation"]
    expire --> queue
```

Waiting positions are computed from WAITING records ordered by created_at and UUID. Inactive, manually restricted and overdue-restricted readers are not promoted while ineligible. Deactivation or a manual restriction cancels their active reservations. A student who has reached their loan limit can hold a pickup reservation but must become eligible before collecting it. Deadlines are enforced in SQL even if a worker runs late.

Copies have AVAILABLE, BORROWED, RESERVED, DAMAGED, LOST or MAINTENANCE status, plus an independent condition and retirement timestamp. Loans are ACTIVE, RETURNED or LOST; overdue is derived from due_at. Reservation states are WAITING, READY_FOR_PICKUP, COMPLETED, CANCELLED and EXPIRED. Existing loan due dates and existing pickup deadlines are preserved when policies change.
