// Sample donations for the home card until the «التبرعات» section is programmed.
// Replace with the API once donations are recorded; nothing else reads this file.
export interface DonationsSummary {
  cash: number;
  cashBefore: number;
  donors: number;
  food: { label: string; qty: number; unit: string }[];
}

export const SAMPLE_DONATIONS: DonationsSummary = {
  cash: 6_450_000,
  cashBefore: 5_200_000,
  donors: 37,
  food: [
    { label: 'سلة غذائية', qty: 120, unit: 'سلة' },
    { label: 'طحين', qty: 450, unit: 'كغم' },
    { label: 'رز', qty: 300, unit: 'كغم' },
  ],
};
