import * as unzipper from "unzipper";

export class Animation {
    public url: string;
    public name: string;
    public width: number;

    constructor(url: string, name: string, width: number) {
        this.url = url;
        this.name = name;
        this.width = width;
    }
}

export class Pet {
    public animations: Animation[] = [];
    public holdingAnimation: Animation | null = null;
    public reflectionOffset: number = 0;

    constructor(animations: Animation[], holdingAnimation: Animation | null, reflectionOffset: number) {
        this.animations = animations;
        this.holdingAnimation = holdingAnimation;
        this.reflectionOffset = reflectionOffset;
    }

    static async fromFile(path: string): Promise<Pet> {
        const pet = new Pet([], null, 0)

        const directory = await unzipper.Open.file(path);

        const manifest = directory.files.find(f => f.path.endsWith("manifest.json"));

        async function getAnimationURL(path: string): Promise<string | undefined> {
            const anim = directory.files.find(f => f.path.includes(path));
            
            if(anim) {
                const part = anim.path.split(".").at(-1);

                if(part != undefined) {
                    const ext = part.toLowerCase();

                    if (["png", "jpg", "jpeg"].includes(ext)) {
                        const mime = ext === "jpg" ? "jpeg" : ext;

                        return `data:image/${mime};base64,${(await anim.buffer()).toString("base64")}`;
                    }
                }
            }
        }

        if(manifest) {
            const parsedManifest = JSON.parse(
                (await manifest.buffer()).toString("utf8")
            );

            if (Array.isArray(parsedManifest.animations)) {
                for(const animation of parsedManifest.animations) {
                    if (typeof animation.path !== "string") continue;
                    if (typeof animation.name !== "string") continue;
                    if (typeof animation.width !== "number") continue;

                    const url = await getAnimationURL(animation.path);

                    if(url) {
                        pet.animations.push(
                            new Animation(
                                url,
                                animation.name,
                                animation.width
                            )
                        )
                    }
                }
            }

            const holdingAnimation = parsedManifest.holdingAnimation

            if(holdingAnimation) {
                if(
                    typeof holdingAnimation.path == "string" &&
                    typeof holdingAnimation.width == "number"
                ) {

                    const url = await getAnimationURL(holdingAnimation.path);

                    if(url) {
                        pet.holdingAnimation = new Animation(
                            url,
                            "holding",
                            holdingAnimation.width
                        )
                    }
                }
            }

            const reflectionOffset = parsedManifest.reflectionOffset

            if(reflectionOffset) {
                if(typeof reflectionOffset == "number") {
                    pet.reflectionOffset = reflectionOffset;
                }
            }
        } else {
            throw new Error("No manifest.json in archive")
        }

        return pet;
    }
}