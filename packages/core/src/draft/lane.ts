import { Role } from "../models/Role";

// Whether two roles face each other in lane; bot lane is ADC and support together.
export function isInLane(role: Role, otherRole: Role) {
    if (role === otherRole) return true;

    const botLane: Role[] = [Role.Bottom, Role.Support];
    return botLane.includes(role) && botLane.includes(otherRole);
}
