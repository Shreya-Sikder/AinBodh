export const documentFixture = {
  name: "Residential Rental Agreement.pdf",
  type: "Rental Agreement",
  pages: 8,
  sections: [
    { page: 1, section: "2", title: "Contract Period", text: "The tenancy shall run from 1 January 2026 to 31 December 2026." },
    { page: 2, section: "4", title: "Security Deposit", text: "The tenant shall provide a security deposit of BDT 50,000." },
    { page: 3, section: "5", title: "Late Payment", text: "A late-payment penalty of BDT 500 per day is stated." },
    { page: 4, section: "7", title: "Maintenance", text: "The parties have maintenance responsibilities described in this section." },
    { page: 5, section: "9", title: "Termination", text: "Either party may end the agreement with 30 days' written notice." },
    { page: 6, section: "12", title: "Indemnification", text: "Certain losses or claims may be assigned to the responsible party." },
    { page: 7, section: "13", title: "General Conditions", text: "Additional conditions are described in this section." },
    { page: 8, section: "14", title: "Early Termination", text: "The agreement does not clearly specify an additional early-termination penalty." },
  ],
  references: [
    { id: "r1", label: "Page 1 · Section 2", page: 1 },
    { id: "r2", label: "Page 2 · Section 4", page: 2 },
    { id: "r3", label: "Page 3 · Section 5", page: 3 },
    { id: "r4", label: "Page 5 · Section 9", page: 5 },
    { id: "r5", label: "Page 6 · Section 12", page: 6 },
    { id: "r6", label: "Page 8 · Section 14", page: 8 },
  ],
  extractedEntities: {
    parties: ["Landlord", "Tenant"],
    dates: ["1 January 2026", "31 December 2026", "1 February 2026"],
    money: ["BDT 25,000 monthly rent", "BDT 50,000 security deposit", "BDT 500 daily late-payment penalty"],
    obligations: ["Pay rent", "Observe property-use conditions", "Provide written notice before termination"],
  },
};

