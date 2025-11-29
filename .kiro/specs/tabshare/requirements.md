# Requirements Document

## Introduction

TabShare enables users dining in groups to fairly divide restaurant bills by allowing a payer to upload a receipt, automatically extract line items using AWS Textract, and share the bill with group members who can claim their portions. The system handles shared items, tax, tips, and custom fees while calculating each person's fair share.

## Glossary

- **TabShare**: The complete application that manages receipt uploads, item extraction, sharing, and payment calculations
- **Payer**: The user who paid the restaurant bill and uploads the receipt to the system
- **Participant**: A user who is invited to claim items from a shared bill
- **Line Item**: An individual food or beverage item extracted from the receipt
- **Shared Item**: A line item that is split among multiple participants
- **Tax Amount**: The sales tax extracted from the receipt
- **Tip Amount**: The gratuity amount extracted from or added to the receipt
- **Additional Fee**: Any extra charges added by the payer beyond the receipt total
- **Item Claim**: The action of a participant selecting responsibility for paying a portion of a line item
- **Payer Profile**: The user account associated with the person who uploaded the bill

## Requirements

### Requirement 1

**User Story:** As a payer, I want to upload a receipt image to my profile, so that the system can extract and organize the bill items for splitting.

#### Acceptance Criteria

1. WHEN the Payer uploads a receipt image, TabShare SHALL send the image to AWS Textract for processing
2. WHEN AWS Textract completes processing, TabShare SHALL extract all line items with their names and prices
3. WHEN AWS Textract completes processing, TabShare SHALL extract the tax amount from the receipt
4. WHEN AWS Textract completes processing, TabShare SHALL extract the tip amount from the receipt
5. TabShare SHALL store the uploaded receipt image associated with the Payer Profile

### Requirement 2

**User Story:** As a payer, I want to share the uploaded bill with other participants, so that they can select which items they consumed.

#### Acceptance Criteria

1. WHEN the Payer initiates bill sharing, TabShare SHALL generate a unique shareable link for the bill
2. TabShare SHALL allow the Payer to invite Participants by email or shareable link
3. WHEN a Participant accesses the shared bill, TabShare SHALL display all extracted line items with their prices
4. TabShare SHALL allow each Participant to view which items have been claimed by other Participants

### Requirement 2A

**User Story:** As a payer, I want multiple convenient ways to share the bill link, so that I can quickly distribute it to participants using their preferred method.

#### Acceptance Criteria

1. WHEN the Payer views the shareable link, TabShare SHALL display a QR code that encodes the bill URL
2. TabShare SHALL provide a copy-to-clipboard button that copies the shareable link when clicked
3. WHEN the Payer clicks the copy-to-clipboard button, TabShare SHALL display a confirmation message within 1 second
4. TabShare SHALL provide sharing buttons for WhatsApp, SMS, and email
5. WHEN the Payer clicks a social sharing button, TabShare SHALL open the respective application with the bill link pre-populated

### Requirement 3

**User Story:** As a participant, I want to select items or percentages of items that I consumed, so that my fair share is calculated accurately.

#### Acceptance Criteria

1. WHEN a Participant selects a Line Item, TabShare SHALL allow the Participant to claim a percentage between 1 and 100 of that item
2. WHEN a Participant selects a Line Item, TabShare SHALL allow the Participant to claim the full item
3. TabShare SHALL display the remaining unclaimed percentage for each Line Item
4. WHEN multiple Participants claim portions of a Line Item, TabShare SHALL track each claim separately
5. IF the total claimed percentage for a Line Item exceeds 100 percent, THEN TabShare SHALL display a warning to all Participants

### Requirement 4

**User Story:** As a payer, I want to mark specific items as shared among all participants or a defined number of people, so that common items like appetizers are split fairly without manual selection.

#### Acceptance Criteria

1. TabShare SHALL allow the Payer to flag any Line Item as shared among all Participants
2. TabShare SHALL allow the Payer to specify a custom number of people for sharing a Line Item
3. WHEN the Payer flags a Line Item as shared, TabShare SHALL automatically divide that item's cost equally among the specified number of people
4. WHEN the Payer flags a Line Item as shared among all Participants, TabShare SHALL recalculate the split whenever a new Participant joins
5. TabShare SHALL prevent Participants from manually claiming portions of items flagged as shared by the Payer

### Requirement 5

**User Story:** As a payer, I want tax and tip to be distributed proportionally among all participants, so that everyone pays their fair share of these amounts.

#### Acceptance Criteria

1. TabShare SHALL distribute the Tax Amount proportionally based on each Participant's subtotal of claimed items
2. TabShare SHALL distribute the Tip Amount proportionally based on each Participant's subtotal of claimed items
3. WHEN calculating each Participant's total, TabShare SHALL include their proportional share of tax and tip
4. TabShare SHALL display the tax and tip breakdown for each Participant in their payment summary

### Requirement 6

**User Story:** As a payer, I want to adjust the extracted tax and tip amounts or add additional fees, so that I can correct any extraction errors or account for extra charges.

#### Acceptance Criteria

1. TabShare SHALL allow the Payer to manually edit the Tax Amount after extraction
2. TabShare SHALL allow the Payer to manually edit the Tip Amount after extraction
3. TabShare SHALL allow the Payer to add one or more Additional Fees with custom descriptions and amounts
4. WHEN the Payer modifies tax, tip, or adds fees, TabShare SHALL recalculate all Participant totals immediately
5. TabShare SHALL distribute Additional Fees proportionally among all Participants based on their claimed item subtotals

### Requirement 7

**User Story:** As a participant, I want to see my calculated total with a breakdown, so that I understand exactly what I owe.

#### Acceptance Criteria

1. TabShare SHALL display each Participant's subtotal of claimed Line Items
2. TabShare SHALL display each Participant's proportional share of the Tax Amount
3. TabShare SHALL display each Participant's proportional share of the Tip Amount
4. TabShare SHALL display each Participant's proportional share of any Additional Fees
5. TabShare SHALL display each Participant's final total amount owed
6. WHEN any claims or amounts change, TabShare SHALL update all Participant totals within 2 seconds

### Requirement 8

**User Story:** As a payer, I want to view a real-time dashboard showing participant activity, so that I can monitor the bill splitting progress as it happens.

#### Acceptance Criteria

1. TabShare SHALL display a real-time dashboard to the Payer showing all Participants and their current totals
2. WHEN a Participant claims or modifies an item claim, TabShare SHALL update the Payer's dashboard within 2 seconds
3. TabShare SHALL display which Line Items each Participant has claimed on the dashboard
4. TabShare SHALL highlight any Line Items that remain unclaimed or are over-claimed on the dashboard
5. TabShare SHALL calculate and display the difference between the original receipt total and the sum of all Participant totals
6. IF the sum of Participant totals does not match the receipt total within 1 cent, THEN TabShare SHALL display a warning to the Payer

### Requirement 9

**User Story:** As a participant, I want to see in real-time which items other participants are selecting and what percentage they claimed, so that I can avoid conflicts and coordinate claims without delays.

#### Acceptance Criteria

1. WHEN any Participant claims or modifies a Line Item claim, TabShare SHALL broadcast the update to all other active Participants within 1 second
2. TabShare SHALL display next to each Line Item the names of all Participants who have claimed portions in real-time
3. TabShare SHALL display the percentage or amount claimed by each Participant for each Line Item in real-time
4. TabShare SHALL update the remaining unclaimed percentage for each Line Item in real-time as claims are made
5. TabShare SHALL visually distinguish between fully claimed, partially claimed, and unclaimed Line Items
6. TabShare SHALL maintain real-time synchronization for all Participants viewing the same bill simultaneously

### Requirement 10

**User Story:** As a system administrator, I want bills to be automatically deleted after 30 days, so that storage costs are managed and user data is not retained indefinitely.

#### Acceptance Criteria

1. TabShare SHALL store each uploaded bill with its associated receipt image and claim data for 30 days from the upload date
2. WHEN a bill reaches 30 days after upload, TabShare SHALL automatically delete the bill and all associated data
3. TabShare SHALL delete the receipt image from storage when the bill is deleted
4. TabShare SHALL delete all Participant claims and calculation data when the bill is deleted
5. WHEN a bill is 7 days from automatic deletion, TabShare SHALL send a notification to the Payer

### Requirement 11

**User Story:** As a user on a mobile device, I want to capture receipt images using my phone's camera or select from my photo library, so that I can quickly upload bills while at the restaurant.

#### Acceptance Criteria

1. TabShare SHALL provide a mobile-optimized user interface that adapts to screen sizes below 768 pixels width
2. WHEN a Payer initiates receipt upload on a mobile device, TabShare SHALL offer the option to capture a photo using the device camera
3. WHEN a Payer initiates receipt upload on a mobile device, TabShare SHALL offer the option to select an image from the device's local storage
4. TabShare SHALL display a camera preview when the Payer chooses to capture a photo
5. TabShare SHALL allow the Payer to retake the photo before uploading
6. TabShare SHALL support common image formats including JPEG, PNG, and HEIC for receipt uploads
